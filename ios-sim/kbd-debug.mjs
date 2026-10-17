import { remote } from 'webdriverio';
const driver = await remote({ hostname:'127.0.0.1', port:4724, path:'/', logLevel:'error',
  capabilities:{platformName:'iOS',browserName:'Safari','appium:automationName':'XCUITest','appium:udid':process.env.UDID,'appium:nativeWebTap':true,'appium:wdaLocalPort':8101,'appium:connectHardwareKeyboard':false}});
await driver.switchContext('NATIVE_APP');
const tries = {
 predName: '-ios predicate string:name == "shift"',
 predLabelVis: '-ios predicate string:label == "shift" AND visible == 1',
 predBtn: '-ios predicate string:type == "XCUIElementTypeButton" AND label == "shift"',
 chainBtn: '-ios class chain:**/XCUIElementTypeButton[`name == "shift"`]',
 accId: '~shift',
};
for (const [k,v] of Object.entries(tries)) {
  const els = await driver.$$(v);
  const info = [];
  for (const e of els.slice(0,3)) info.push({vis: await e.getAttribute('visible'), en: await e.getAttribute('enabled'), t: await e.getAttribute('type')});
  console.log(k, els.length, JSON.stringify(info));
}
await driver.deleteSession();
