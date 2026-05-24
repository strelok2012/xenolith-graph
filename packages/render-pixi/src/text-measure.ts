import { CanvasTextMetrics, TextStyle, type TextStyleFontWeight } from 'pixi.js'
import type { TextMeasurer } from './layout.js'

/** A `TextMeasurer` backed by PIXI's `CanvasTextMetrics`. TextStyle objects are cached per
 *  (fontSize × fontWeight) since `measureNodeSize` calls this once per node label at load time and
 *  the same handful of font variants repeats across hundreds of nodes. */
export function createPixiTextMeasurer(fontFamily: string): TextMeasurer {
  const styles = new Map<string, TextStyle>()
  return (text, fontSize, fontWeight) => {
    const key = `${fontSize}|${fontWeight}`
    let style = styles.get(key)
    if (!style) {
      style = new TextStyle({
        fontFamily,
        fontSize,
        fontWeight: String(fontWeight) as TextStyleFontWeight,
      })
      styles.set(key, style)
    }
    return CanvasTextMetrics.measureText(text, style, undefined, false).width
  }
}
