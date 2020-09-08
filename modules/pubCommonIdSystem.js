/**
 * This module adds PubCommonId to the User ID module
 * The {@link module:modules/userId} module is required
 * @module modules/pubCommonIdSystem
 * @requires module:modules/userId
 */

import * as utils from '../src/utils.js';
import {submodule} from '../src/hook.js';
import {getStorageManager} from '../src/storageManager.js';
import {ajax} from '../src/ajax.js';

const PUB_COMMON_ID = 'PublisherCommonId';

const MODULE_NAME = 'pubCommonId';

const SHAREDID_OPT_OUT_VALUE = '00000000000000000000000000';
const SHAREDID_COOKIE_EXPIRATION = 2419200000; // 28 days in milliseconds
const SHAREDID_COOKIE_NAME = 'sharedid';
const SHAREDID_URL = 'https://id.sharedid.org/id';

const storage = getStorageManager(null, 'pubCommonId');

function setCookieFromResponse() {
  return {
    success: function (responseBody) {
      let value = {};
      if (responseBody) {
        try {
          let responseObj = JSON.parse(responseBody);
          utils.logInfo('SharedId: Generated SharedId: ' + responseObj.sharedId);
          value = responseObj.sharedId;
        } catch (error) {
          utils.logError(error);
        }
      }
      const expiresStr = new Date(Date.now() + SHAREDID_COOKIE_EXPIRATION).toUTCString();
      storage.setCookie(SHAREDID_COOKIE_NAME, value, expiresStr, 'Lax');
    },
    error: function (statusText, responseBody) {
      utils.logInfo('SharedId: failed to get id');
    }
  }
}

function encodeId(pubcId) {
  const result = {};
  const bidIds = {
    id: pubcId,
  };
  let sharedId = storage.getCookie(SHAREDID_COOKIE_NAME);
  if (sharedId) {
    if (sharedId != SHAREDID_OPT_OUT_VALUE) {
      bidIds.third = sharedId;
    }
  } else {
    ajax(SHAREDID_URL, setCookieFromResponse(), undefined, {method: 'GET', withCredentials: true});
  }
  result.pubcid = bidIds;
  utils.logInfo('PubcId: Decoded value ' + JSON.stringify(result));
  return result;
}

/** @type {Submodule} */
export const pubCommonIdSubmodule = {
  /**
   * used to link submodule with config
   * @type {string}
   */
  name: MODULE_NAME,
  /**
   * Return a callback function that calls the pixelUrl with id as a query parameter
   * @param pixelUrl
   * @param id
   * @returns {function}
   */
  makeCallback: function (pixelUrl, id = '') {
    if (!pixelUrl) {
      return;
    }

    // Use pubcid as a cache buster
    const urlInfo = utils.parseUrl(pixelUrl);
    urlInfo.search.id = encodeURIComponent('pubcid:' + id);
    const targetUrl = utils.buildUrl(urlInfo);

    return function () {
      utils.triggerPixel(targetUrl);
    };
  },
  /**
   * decode the stored id value for passing to bid requests
   * @function
   * @param {string} value
   * @returns {{pubcid: {id:string, third:string}}}
   */
  decode(value) {
    return (value) ? encodeId(value) : undefined;
  },
  /**
   * performs action to obtain id
   * @function
   * @param {SubmoduleParams} [configParams]
   * @returns {IdResponse}
   */
  getId: function ({create = true, pixelUrl} = {}) {
    try {
      if (typeof window[PUB_COMMON_ID] === 'object') {
        // If the page includes its own pubcid module, then save a copy of id.
        return {id: window[PUB_COMMON_ID].getId()};
      }
    } catch (e) {
    }

    const newId = (create && utils.hasDeviceAccess()) ? utils.generateUUID() : undefined;
    return {
      id: newId,
      callback: this.makeCallback(pixelUrl, newId)
    }
  },
  /**
   * performs action to extend an id
   * @function
   * @param {SubmoduleParams} [configParams]
   * @param {Object} storedId existing id
   * @returns {IdResponse|undefined}
   */
  extendId: function ({extend = false, pixelUrl} = {}, storedId) {
    try {
      if (typeof window[PUB_COMMON_ID] === 'object') {
        // If the page includes its onw pubcid module, then there is nothing to do.
        return;
      }
    } catch (e) {
    }

    if (extend) {
      // When extending, only one of response fields is needed
      const callback = this.makeCallback(pixelUrl, storedId);
      return callback ? {callback: callback} : {id: storedId};
    }
  },

  /**
   * @param {string} domain
   * @param {HTMLDocument} document
   * @return {(string|undefined)}
   */
  domainOverride: function () {
    const domainElements = document.domain.split('.');
    const cookieName = `_gd${Date.now()}`;
    for (let i = 0, topDomain; i < domainElements.length; i++) {
      const nextDomain = domainElements.slice(i).join('.');

      // write test cookie
      storage.setCookie(cookieName, '1', undefined, undefined, nextDomain);

      // read test cookie to verify domain was valid
      if (storage.getCookie(cookieName) === '1') {
        // delete test cookie
        storage.setCookie(cookieName, '', 'Thu, 01 Jan 1970 00:00:01 GMT', undefined, nextDomain);
        // cookie was written successfully using test domain so the topDomain is updated
        topDomain = nextDomain;
      } else {
        // cookie failed to write using test domain so exit by returning the topDomain
        return topDomain;
      }
    }
  }
};

submodule('userId', pubCommonIdSubmodule);
