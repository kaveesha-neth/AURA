const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {APP_NAME,APP_ID,standaloneDataPath}=require('../src/core/app-identity.cjs');
const pkg=require('../package.json');
test('standalone app identity cannot replace the original AURA installer',()=>{
  assert.equal(APP_NAME,'AURA');
  assert.equal(pkg.build.appId,APP_ID);
  assert.notEqual(APP_ID,'com.aura.musicplayer');
  assert.equal(pkg.build.productName,APP_NAME);
  assert.equal(pkg.build.win.executableName,APP_NAME);
  assert.equal(pkg.build.nsis.shortcutName,APP_NAME);
  assert.equal(pkg.build.nsis.uninstallDisplayName,APP_NAME);
  assert.notEqual(pkg.name,'aura-music-player');
  assert.equal(pkg.build.publish,null);
  assert.equal(pkg.aura.updatesEnabled,false);
});
test('standalone data directory is independent and respects isolated test profiles',()=>{
  const appData=path.resolve('test-appdata');
  assert.equal(standaloneDataPath(appData,''),path.join(appData,'AURA 3.0'));
  const override=path.resolve('.cache','isolated-profile');
  assert.equal(standaloneDataPath(appData,override),override);
});
