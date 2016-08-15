import { Social } from './social';
import { SocialIdentity } from './enums';
import { AuthType, RequestMethod, KinveyRequest } from '../../request';
import { KinveyError } from '../../errors';
import { Promise } from 'es6-promise';
import path from 'path';
import url from 'url';
import isString from 'lodash/isString';
const authPathname = process.env.KINVEY_MIC_AUTH_PATHNAME || '/oauth/auth';
const tokenPathname = process.env.KINVEY_MIC_TOKEN_PATHNAME || '/oauth/token';

/**
 * Enum for Mobile Identity Connect authorization grants.
 * @property  {string}    AuthorizationCodeLoginPage   AuthorizationCodeLoginPage grant
 * @property  {string}    AuthorizationCodeAPI         AuthorizationCodeAPI grant
 */
const AuthorizationGrant = {
  AuthorizationCodeLoginPage: 'AuthorizationCodeLoginPage',
  AuthorizationCodeAPI: 'AuthorizationCodeAPI'
};
Object.freeze(AuthorizationGrant);
export { AuthorizationGrant };

/**
 * @private
 */
export class MobileIdentityConnect extends Social {
  get identity() {
    return SocialIdentity.MobileIdentityConnect;
  }

  static get identity() {
    return SocialIdentity.MobileIdentityConnect;
  }

  login(redirectUri, authorizationGrant = AuthorizationGrant.AuthorizationCodeLoginPage, options = {}) {
    const clientId = this.client.appKey;

    const promise = Promise.resolve()
      .then(() => {
        if (authorizationGrant === AuthorizationGrant.AuthorizationCodeLoginPage) {
          // Step 1: Request a code
          return this.requestCodeWithPopup(clientId, redirectUri, options);
        } else if (authorizationGrant === AuthorizationGrant.AuthorizationCodeAPI) {
          // Step 1a: Request a temp login url
          return this.requestTempLoginUrl(clientId, redirectUri, options)
            .then(url => this.requestCodeWithUrl(url, clientId, redirectUri, options)); // Step 1b: Request a code
        }

        throw new KinveyError(`The authorization grant ${authorizationGrant} is unsupported. ` +
          'Please use a supported authorization grant.');
      })
      .then(code => this.requestToken(code, clientId, redirectUri, options)) // Step 3: Request a token
      .then(session => {
        session.client_id = clientId;
        session.redirect_uri = redirectUri;
        session.protocol = this.client.micProtocol;
        session.host = this.client.micHost;
        return session;
      });

    return promise;
  }

  requestTempLoginUrl(clientId, redirectUri, options = {}) {
    let pathname = '/';

    if (options.version) {
      let version = options.version;

      if (!isString(version)) {
        version = String(version);
      }

      pathname = path.join(pathname, version.indexOf('v') === 0 ? version : `v${version}`);
    }

    const request = new KinveyRequest({
      method: RequestMethod.POST,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      url: url.format({
        protocol: this.client.micProtocol,
        host: this.client.micHost,
        pathname: path.join(pathname, authPathname)
      }),
      properties: options.properties,
      body: {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code'
      }
    });
    return request.execute().then(response => response.data.temp_login_uri);
  }

  requestCodeWithPopup(clientId, redirectUri, options = {}) {
    const promise = Promise.resolve().then(() => {
      let pathname = '/';

      if (options.version) {
        let version = options.version;

        if (!isString(version)) {
          version = String(version);
        }

        pathname = path.join(pathname, version.indexOf('v') === 0 ? version : `v${version}`);
      }

      if (global.KinveyPopup) {
        const popup = new global.KinveyPopup();
        return popup.open(url.format({
          protocol: this.client.micProtocol,
          host: this.client.micHost,
          pathname: path.join(pathname, authPathname),
          query: {
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code'
          }
        }));
      }

      throw new KinveyError('KinveyPopup is undefined.'
        + ` Unable to login using authorization grant ${AuthorizationGrant.AuthorizationCodeLoginPage}.`);
    }).then((popup) => {
      const promise = new Promise((resolve, reject) => {
        let redirected = false;

        function loadCallback(event) {
          try {
            if (event.url && event.url.indexOf(redirectUri) === 0 && redirected === false) {
              redirected = true;
              popup.removeAllListeners();
              popup.close();
              resolve(url.parse(event.url, true).query.code);
            }
          } catch (error) {
            // Just catch the error
          }
        }

        function errorCallback(event) {
          try {
            if (event.url && event.url.indexOf(redirectUri) === 0 && redirected === false) {
              redirected = true;
              popup.removeAllListeners();
              popup.close();
              resolve(url.parse(event.url, true).query.code);
            } else if (redirected === false) {
              popup.removeAllListeners();
              popup.close();
              reject(new KinveyError(event.message, '', event.code));
            }
          } catch (error) {
            // Just catch the error
          }
        }

        function closedCallback() {
          if (redirected === false) {
            popup.removeAllListeners();
            reject(new KinveyError('Login has been cancelled.'));
          }
        }

        popup.on('loadstart', loadCallback);
        popup.on('loadstop', loadCallback);
        popup.on('error', errorCallback);
        popup.on('closed', closedCallback);
      });
      return promise;
    });

    return promise;
  }

  requestCodeWithUrl(loginUrl, clientId, redirectUri, options = {}) {
    const promise = Promise.resolve().then(() => {
      const request = new KinveyRequest({
        method: RequestMethod.POST,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        url: loginUrl,
        properties: options.properties,
        body: {
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          username: options.username,
          password: options.password
        },
        followRedirect: false
      });
      return request.execute();
    }).then(response => {
      const location = response.getHeader('location');

      if (location) {
        return url.parse(location, true).query.code;
      }

      throw new KinveyError(`Unable to authorize user with username ${options.username}.`,
        'A location header was not provided with a code to exchange for an auth token.');
    });

    return promise;
  }

  requestToken(code, clientId, redirectUri, options = {}) {
    const request = new KinveyRequest({
      method: RequestMethod.POST,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      authType: AuthType.App,
      url: url.format({
        protocol: this.client.micProtocol,
        host: this.client.micHost,
        pathname: tokenPathname
      }),
      properties: options.properties,
      body: {
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code: code
      }
    });
    const promise = request.execute().then(response => response.data);
    return promise;
  }
}
