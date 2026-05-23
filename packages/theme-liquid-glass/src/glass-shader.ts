/**
 * Liquid Glass body shader — direct port of dashersw/liquid-glass-js's fragment shader, adapted
 * to PIXI v8 Mesh rendering. Their algorithm + parameter set 1:1; only the texture-coord
 * derivation differs because PIXI Mesh draws at world position (not as a full-screen quad).
 *
 * Algorithm (per fragment):
 *  1. Compute textureCoord = stage_pixel_position / backdrop_size (the dashersw equivalent of
 *     `(container_center + (uv - 0.5) * container_size) / texture_size`).
 *  2. Rounded-rect SDF → distFromEdgeShape + shape normal.
 *  3. Three exponential-falloff refraction bands (base/edge/rim) blended by per-band intensity,
 *     plus a corner-boost spike and a ripple effect for life. Sum → refraction offset in UV.
 *  4. 13×13 circular gaussian blur on the backdrop, centred at the refracted UV.
 *  5. Vertical white→grey gradient tint mixed into the blurred backdrop at `tintOpacity`.
 *  6. Rounded-rect AA mask written to alpha.
 *
 * Parameters match dashersw's tuned defaults (Edge Intensity 0.01, Rim Intensity 0.05, etc.) —
 * those landed Apple-grade on a forest backdrop, so we use them verbatim and only tune the
 * canvas later for our darker context.
 */

export const glassVertexGLSL = /* glsl */ `
in vec2 aPosition;
out vec2 vLocal;
out vec2 vStagePixel;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  vLocal = aPosition;
  mat3 stage = uWorldTransformMatrix * uTransformMatrix;
  vStagePixel = (stage * vec3(aPosition, 1.0)).xy;
  mat3 mvp = uProjectionMatrix * stage;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}
`

export const glassFragmentGLSL = /* glsl */ `
in vec2 vLocal;
in vec2 vStagePixel;

uniform sampler2D uBackdropTex;
uniform vec2  uBackdropSize;      // dashersw u_textureSize
uniform vec2  uSize;              // dashersw u_resolution (container px size)
uniform float uBorderRadius;
uniform float uBlurRadius;
uniform float uEdgeIntensity;
uniform float uRimIntensity;
uniform float uBaseIntensity;
uniform float uEdgeDistance;
uniform float uRimDistance;
uniform float uBaseDistance;
uniform float uCornerBoost;
uniform float uRippleEffect;
uniform float uTintOpacity;
uniform float uWarp;

float roundedRectDistance(vec2 coord, vec2 size, float radius) {
  vec2 center = size * 0.5;
  vec2 pixelCoord = coord * size;
  vec2 toCorner = abs(pixelCoord - center) - (center - radius);
  float outsideCorner = length(max(toCorner, 0.0));
  float insideCorner = min(max(toCorner.x, toCorner.y), 0.0);
  return outsideCorner + insideCorner - radius;
}

void main() {
  // Mesh-local UV in [0,1] for the rounded-rect math (dashersw equivalent: coord).
  vec2 coord = vLocal / uSize;

  // PIXI port of dashersw textureCoord = pagePixel / textureSize. PIXI Mesh pipeline already
  // gives us the fragment stage-pixel position via worldTransform * aPosition.
  vec2 textureCoord = vStagePixel / uBackdropSize;

  // ----- shape + normal -------------------------------------------------------------------
  float distFromEdgeShape = -roundedRectDistance(coord, uSize, uBorderRadius);
  distFromEdgeShape = max(distFromEdgeShape, 0.0);
  vec2 shapeNormal = normalize(coord - vec2(0.5));

  float distFromLeft   = coord.x;
  float distFromRight  = 1.0 - coord.x;
  float distFromTop    = coord.y;
  float distFromBottom = 1.0 - coord.y;
  float distFromEdge   = distFromEdgeShape / min(uSize.x, uSize.y);

  // ----- refraction (3 exponential bands + corner boost + ripple) -------------------------
  float normalizedDistance = distFromEdge * min(uSize.x, uSize.y);
  float baseIntensity = 1.0 - exp(-normalizedDistance * uBaseDistance);
  float edgeIntensity = exp(-normalizedDistance * uEdgeDistance);
  float rimIntensity  = exp(-normalizedDistance * uRimDistance);

  float baseComponent = uWarp > 0.5 ? baseIntensity * uBaseIntensity : 0.0;
  float totalIntensity = baseComponent + edgeIntensity * uEdgeIntensity + rimIntensity * uRimIntensity;
  vec2 baseRefraction = shapeNormal * totalIntensity;

  float cornerProximityX = min(distFromLeft, distFromRight);
  float cornerProximityY = min(distFromTop, distFromBottom);
  float cornerDistance = max(cornerProximityX, cornerProximityY);
  float cornerNormalized = cornerDistance * min(uSize.x, uSize.y);
  float cornerBoost = exp(-cornerNormalized * 0.3) * uCornerBoost;
  vec2 cornerRefraction = shapeNormal * cornerBoost;

  vec2 perpendicular = vec2(-shapeNormal.y, shapeNormal.x);
  float ripple = sin(distFromEdge * 25.0) * uRippleEffect * rimIntensity;
  vec2 textureRefraction = perpendicular * ripple;

  vec2 totalRefraction = baseRefraction + cornerRefraction + textureRefraction;
  textureCoord += totalRefraction;

  // ----- 13x13 circular gaussian blur on backdrop ----------------------------------------
  vec4 color = vec4(0.0);
  vec2 texelSize = 1.0 / uBackdropSize;
  float sigma = uBlurRadius / 2.0;
  vec2 blurStep = texelSize * sigma;
  float totalWeight = 0.0;

  for (float i = -6.0; i <= 6.0; i += 1.0) {
    for (float j = -6.0; j <= 6.0; j += 1.0) {
      float dist = length(vec2(i, j));
      if (dist > 6.0) continue;
      float weight = exp(-(dist * dist) / (2.0 * sigma * sigma));
      vec2 offset = vec2(i, j) * blurStep;
      color += texture2D(uBackdropTex, textureCoord + offset) * weight;
      totalWeight += weight;
    }
  }
  color /= totalWeight;

  // ----- vertical gradient tint -----------------------------------------------------------
  // Cool-shifted tint so the glass picks up the navy backdrop's character. Top is near-white
  // (slightly cool), bottom drifts toward a desaturated blue-grey — gives the body the WWDC25
  // "cool glass over blue" look without overpowering the actual backdrop sample beneath.
  float gradientPosition = coord.y;
  vec3 topTint = vec3(0.96, 0.98, 1.0);
  vec3 bottomTint = vec3(0.62, 0.72, 0.88);
  vec3 gradientTint = mix(topTint, bottomTint, gradientPosition);
  color.rgb = mix(color.rgb, gradientTint, uTintOpacity);

  // ----- rounded-rect AA mask -------------------------------------------------------------
  // Discard fragments well outside the rounded silhouette so the mesh quad doesn't leave
  // a faint rectangular halo from accumulated blur/refraction samples blending under alpha=0.
  float maskDistance = roundedRectDistance(coord, uSize, uBorderRadius);
  if (maskDistance > 1.0) discard;
  float mask = 1.0 - smoothstep(-1.0, 1.0, maskDistance);

  gl_FragColor = vec4(color.rgb, mask);
}
`
