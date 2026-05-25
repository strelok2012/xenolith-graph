import { chromium } from '@playwright/test'
const b=await chromium.launch();const p=await b.newPage();await p.setViewportSize({width:560,height:680})
await p.goto('http://localhost:5173/',{waitUntil:'networkidle'});await p.waitForSelector('canvas');await p.waitForFunction(()=>'__xenoEditor' in window)
await p.evaluate(()=>{const ed=window.__xenoEditor;let v;for(const x of ed.graph.nodes())if(x.type==='Validate')v=x
  const z=1.5;ed.resetView();ed.zoomAt({x:0,y:0},z);ed.pan(280-(v.position.x+v.size.x/2)*z,200-v.position.y*z)})
await p.waitForTimeout(400); await p.screenshot({path:'/tmp/enrich-moved.png'})
await b.close()
