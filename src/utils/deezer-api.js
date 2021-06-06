const assert = require('assert');
const https = require('https');

module.exports = class Deezer {
  constructor({ appplication_id, secret, authorization_code, redirect_uri }) {
    assert.ok(appplication_id, 'Deezer application id missing!');
    assert.ok(secret, 'Deezer secret missing!');
    
    this.appplication_id = appplication_id;
    this.secret = secret;
    this.redirect_uri = redirect_uri;
    this.authorization_code = authorization_code;
  }
  
  get_access_token() {
    return new Promise((resolve, reject) => {
      const request = https.request({
        hostname: 'connect.deezer.com',
        path: `/oauth/access_token.php?app_id=${this.appplication_id}&secret=${this.secret}&code=${this.authorization_code}&output=json`,
        method: 'get'
      }, response => {
        response.setEncoding('utf8');

        const chunks = [];

        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const result = JSON.parse(chunks.join(''));
          this.access_token = result.access_token;
          this.access_token_expiration_date = result.expires;
          resolve();
        });
      });

      request.on('error', e => reject(e));
      request.end();
    });
  }

  get_current_user_playlists() {
    return new Promise((resolve, reject) => {
      const request = https.request({
        hostname: 'api.deezer.com',
        path: `/user/me/playlists?access_token=${this.access_token}`,
        method: 'get'
      }, response => {
        response.setEncoding('utf8');
        
        const chunks = [];

        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          resolve(JSON.parse(chunks.join('')));
        });
      });

      request.on('error', e => reject(e));
      request.end();
    });
  }

  get_playlist_tracks(playlist_id) {
    return new Promise(async (resolve, reject) => {
      try {
        let url = `https://api.deezer.com/playlist/${playlist_id}/tracks?access_token=${this.access_token}`;
        let tracks = [];
        while (true) {
          const { data, next } = await fetch_playlist_tracks(url);
          tracks = tracks.concat(data);
  
          if (next) {
            url = next;
          }
          else {
            break;
          }
        }
  
        resolve(tracks);
      }
      catch (err) {
        reject(err);
      }
    });
  }

  remove_tracks_from_playlist(playlist_id, tracks_id) {
    return new Promise(async (resolve, reject) => {
      const request = https.request({
        hostname: 'api.deezer.com',
        path: `/playlist/${playlist_id}/tracks?access_token=${this.access_token}&songs=${tracks_id.join(',')}`,
        method: 'delete',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }, response => {
        response.setEncoding('utf8');

        const chunks = [];

        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => { 
          resolve(JSON.parse(chunks.join(''))); 
        });
      });

      request.on('error', e => reject(e));
      request.end();
    });
  }
}

function fetch_playlist_tracks(url) {
  return new Promise((resolve, reject) => {
    const formatted_url = new URL(url); 

    const request = https.request({
      hostname: 'api.deezer.com',
      path: formatted_url.pathname + formatted_url.search,
      method: 'get'
    }, response => {
      response.setEncoding('utf8');

      const chunks = [];

      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const result = JSON.parse(chunks.join(''));
        resolve({ data: result.data, next: result.next });
      });
    });

    request.on('error', e => reject(e));
    request.end();
  });
}