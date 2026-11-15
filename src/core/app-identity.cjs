'use strict';
const path = require('node:path');
const APP_NAME = 'AURA';
const APP_ID = 'com.aura.musicplayer3';
// Keep existing libraries and preferences when the display name changes.
const PROFILE_DIRECTORY = 'AURA 3.0';
function standaloneDataPath(appData, override) {
  return override ? path.resolve(override) : path.join(appData, PROFILE_DIRECTORY);
}
module.exports = { APP_NAME, APP_ID, standaloneDataPath };
