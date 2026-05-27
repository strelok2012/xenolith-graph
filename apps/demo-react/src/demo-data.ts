// The shared demo scene now lives in @xenolith/demo/scene so every framework reuses it. This module
// stays as a re-export so existing React demos keep their `../demo-data.js` import.
export { loadDemo } from '@xenolith/demo/scene'
export { demoGraph, demoSchemas } from '@xenolith/demo'
