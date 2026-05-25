import { test } from '@playwright/test'
test('repro', async ({ page }) => {
  await page.goto('/'); await page.waitForSelector('canvas')
  await page.getByRole('button', { name: '7 · Bring your own UI' }).click()
  await page.evaluate(async()=>{await (document as any).fonts.ready}); await page.waitForTimeout(1000)
  const c = (await page.locator('canvas').boundingBox())!
  const at = (r:string,dx=70,dy=10)=>page.evaluate(([rr,ax,ay]:any)=>{const ed=(window as any).__xenoEditor,vp=ed.viewport;for(const n of ed.graph.nodes())if((n.widgets??[])[0]?.renderer===rr)return{x:vp.x+(n.position.x+ax)*vp.zoom,y:vp.y+(n.position.y+ay)*vp.zoom};return null},[r,dx,dy])
  const sig:any=await at('sparkline'), img:any=await at('file-drop',70,60)
  // drag Signal onto Image
  await page.mouse.move(c.x+sig.x,c.y+sig.y); await page.mouse.down(); await page.mouse.move(c.x+img.x,c.y+img.y,{steps:8}); await page.mouse.up(); await page.waitForTimeout(200)
  // collapse Signal
  const chev=await at('sparkline',16,10) as any
  await page.mouse.click(c.x+chev.x,c.y+chev.y); await page.waitForTimeout(400)
  // zoom into the pill
  await page.mouse.move(c.x+chev.x+60,c.y+chev.y); for(let i=0;i<5;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(50)}
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'repro.png' })
})
