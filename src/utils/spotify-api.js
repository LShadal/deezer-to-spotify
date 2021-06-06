const querystring = require('querystring');
const assert = require('assert');
const https = require('https');

module.exports = class Spotify {
  constructor ({ client_id, client_secret, authorization_code, redirect_uri }) {
    assert.ok(client_id, 'Spotify client id missing!');
    assert.ok(client_secret, 'Spotify client secret missing!');
    assert.ok(authorization_code, 'Spotify authorization code missing!');
    assert.ok(redirect_uri, 'Spotify redirect uri missing');

    this.client_id = client_id;
    this.client_secret = client_secret;
    this.authorization_code = authorization_code;
    this.redirect_uri = redirect_uri;
    this.user_id = null;
  }

  get_access_token() {
    return new Promise((resolve, reject) => {
      const body = querystring.stringify({
        'grant_type': 'authorization_code',
        'code': this.authorization_code,
        'redirect_uri': this.redirect_uri
      });
  
      const request = https.request({
        hostname: 'accounts.spotify.com',
        path: '/api/token',
        method: 'post', 
        auth: `${this.client_id}:${this.client_secret}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        }
      }, response => {
        response.setEncoding('utf8');
  
        const chunks = [];
  
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const result = JSON.parse(chunks.join(''));
          this.access_token_expiration_date = result.expires_in;
          this.access_token = result.access_token;
          this.refresh_token = result.refresh_token;
          resolve();
        });
      });
  
      request.on('error', e => reject(e));
      request.write(body);
      request.end();
    });
  }

  refresh_access_token() {
    return new Promise((resolve, reject) => {      
      const body = querystring.stringify({
        'grant_type': 'refresh_token',
        'refresh_token': this.refresh_token
      });

      const request = https.request({
        hostname: 'accounts.spotify.com',
        path: '/api/token',
        method: 'post', 
        auth: `${this.client_id}:${this.client_secret}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        }
      }, response => {
        response.setEncoding('utf8');
  
        const chunks = [];
  
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const result = JSON.parse(chunks.join(''));
          if (result.error) {
            return reject(result);
          }

          this.access_token = result.access_token;
          resolve();
        });
      });
  
      request.on('error', e => reject(e));
      request.write(body);
      request.end();
    }); 
  }

  get_current_user() {
    return new Promise((resolve, reject) => {
      const request = https.request({
        hostname: 'api.spotify.com',
        path: '/v1/me',
        method: 'get',
        headers: {
          'Authorization': `Bearer ${this.access_token}`
        }
      }, response => {
        response.setEncoding('utf8');

        const chunks = [];

        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          this.user_id = JSON.parse(chunks.join('')).id;
          resolve();
        });
      });

      request.on('error', e => reject(e));
      request.end();
    });
  }

  create_playlist(name) {
    return new Promise((resolve, reject) => {
      const body = {
        name: name
      };

      const request = https.request({
        hostname: 'api.spotify.com',
        path: `/v1/users/${this.user_id}/playlists`,
        method: 'post',
        headers: {
          'Authorization': `Bearer ${this.access_token}`,
          'Content-Type': 'application/json',
          'Content-Length': JSON.stringify(body).length
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
      request.write(JSON.stringify(body));
      request.end();
    });
  }

  add_tracks_to_playlist(playlist_id, tracks_id) {
    const body = JSON.stringify({
      uris: tracks_id
    });

    return new Promise((resolve, reject) => {
      const request = https.request({
        hostname: 'api.spotify.com',
        path: `/v1/playlists/${playlist_id}/tracks`,
        method: 'post',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.access_token}`,
          'Content-Length': body.length
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
      request.write(body);
      request.end();
    });  
  }

  search_track(title, artist) {
    return new Promise(async (resolve, reject) => {
      try {
        let track_found;
        let url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(title)}&type=track&limit=20`;
        while (true) {
          track_found = await this.get_track(artist, url);
          if (track_found.next) {
            url = track_found.next;
          }
          else {
            break;
          }
        }

        resolve(track_found);
      }
      catch (err) {
        reject(err);
      }
    });
  }

  get_track(artist, url) {
    return new Promise((resolve, reject) => {
      const formatted_url = new URL(url);

      const request = https.request({
        hostname: 'api.spotify.com',
        path: formatted_url.pathname + formatted_url.search,
        method: 'get',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.access_token}`
        }
      }, response => {
        response.setEncoding('utf8');

        const chunks = [];

        response.on('data', chunk => chunks.push(chunk));
        response.on('end', async () => {
          const result = JSON.parse(chunks.join(''));
          if (result.error) {
            resolve(null);
          }
          else {
            const track_found = await find_track(artist, result.tracks.items);
            if (!track_found) {
              resolve({ next: result.tracks.next });
            }
            else {
              resolve(track_found);
            }
          }
        });
      });
      
      request.on('error', e => reject(e));
      request.end();
    });
  }
}

function find_track(artist, tracks) {
  return new Promise(resolve => {
    let found_track;
    for (const track of tracks) {
      for (const a of track.artists) {
        const a_name = a.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
        const artist_name = artist.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
        if (a_name === artist_name) {
          found_track = {
            artist: a.name,
            name: track.name,
            uri: track.uri
          };
          
          break;
        }
        else if (artist.includes(',')) {
          const artists = artist.split(',');
          for (const element of artists) {
            const element_name = element.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
            if (element_name === a_name) {
              found_track = {
                artist: a.name,
                name: track.name,
                uri: track.uri
              };
              
              break;
            }
          }
          
          break;
        }
        else {
          const a_name_splitted = a_name.split(' ');
          const artist_name_splitted = artist_name.split(' ');
          
          const a_length = a_name_splitted.length;
          const artist_length = artist_name_splitted.length;
          
          let matches;
          let percentage = 0;
          
          if (a_length > artist_length) {
            matches = artist_name_splitted.filter(e => a_name_splitted.includes(e));
            percentage = (matches.length / a_length) * 100;
          }
          else {
            matches = a_name_splitted.filter(e => artist_name_splitted.includes(e));
            percentage = (matches.length / artist_length) * 100;
          }
          
          if (percentage >= 50) {
            found_track = {
              artist: a.name,
              name: track.name,
              uri: track.uri
            };
            
            break;
          }
        }
      }
      
      if (found_track) {
        break;
      }
    }
    
    if (found_track) {
      resolve(found_track);
    }
    else {
      resolve(null);
    }
  });
}

//   get_current_user_playlists() {
//     return new Promise((resolve, reject) => {
//       const request = https.request({
//         hostname: 'api.spotify.com',
//         path: '/v1/me/playlists',
//         method: 'get',
//         headers: {
//           'Accept': 'application/json',
//           'Content-Type': 'application/json',
//           'Authorization': `Bearer ${this.access_token}`
//         }
//       }, response => {
//         response.setEncoding('utf8');

//         const chunks = [];

//         response.on('data', chunk => chunks.push(chunk));
//         response.on('end', () => {
//           resolve(JSON.parse(chunks.join('')));
//         })
//       });

//       request.on('error', e => reject(e));
//       request.end();
//     });
//   }

//   get_playlist_tracks(playlist_id) {
//     return new Promise(async (resolve, reject) => {
//       try {
//         let url = `https://api.spotify.com/v1/playlists/${playlist_id}/tracks`;
//         let tracks = [];
  
//         while (true) {
//           const { data, next } = await this.fetch_playlist_tracks(url);
//           tracks = tracks.concat(data);
  
//           if (next) {
//             url = next;
//           }
//           else {
//             break;
//           }
//         }

//         resolve(tracks);
//       }
//       catch (err) {
//         reject(err);
//       }
//     });
//   }

//   fetch_playlist_tracks(url) {
//     return new Promise((resolve, reject) => {
//       const formatted_url = new URL(url);
  
//       const request = https.request({
//         hostname: 'api.spotify.com',
//         path: formatted_url.pathname + formatted_url.search,
//         method: 'get',
//         headers: {
//           'Accept': 'application/json',
//           'Content-Type': 'application/json',
//           'Authorization': `Bearer ${this.access_token}`
//         }
//       }, response => {
//         response.setEncoding('utf8');
  
//         const chunks = [];
  
//         response.on('data', chunk => chunks.push(chunk));
//         response.on('end', () => {
//           const result = JSON.parse(chunks.join(''));
//           resolve({ data: result.items, next: result.next });
//         });
//       });
  
//       request.on('error', e => reject(e));
//       request.end();
//     });
//   }

//   delete_tracks_from_playlist(playlist_id, tracks_id) {
//     return new Promise((resolve, reject) => {
//       const body = JSON.stringify({
//         tracks: tracks_id
//       });

//       const request = https.request({
//         hostname: 'api.spotify.com',
//         path: `/v1/playlists/${playlist_id}/tracks`,
//         method: 'delete',
//         headers: {
//           'Content-Type': 'application/json',
//           'Authorization': `Bearer ${this.access_token}`,
//           'Content-Length': body.length
//         }
//       }, response => {
//         response.setEncoding('utf8');

//         const chunks = [];

//         response.on('data', chunk => chunks.push(chunk));
//         response.on('end', () => {
//           resolve(JSON.parse(chunks.join('')));
//         });
//       });

//       request.on('error', e => reject(e));
//       request.write(body);
//       request.end();
//     });
//   }