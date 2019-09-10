const net = require('net');
const fs = require('fs');
const path = require('path');
const request = require('request');
const errorPage = require('./404');
const parse = require('url').parse;
const host = 'CERN HACK 2019';

const clean = u => {
  let p = parse(u).pathname;
  p = p.replace(/%2e/gi, '.');
  p = p.replace(/%2f/gi, '/');
  p = p.replace(/%5c/gi, '\\');
  p = p.replace(/^[\/\\]?/g, '/');
  p = p.replace(/[\/\\]\.\.[\/\\]/g, '/');
  return path.normalize(p).replace(/\\/g, '/');
};

const fake09 = url =>
  new Promise(resolve => {
    // if the url has a dot, then it's remote

    if (url.startsWith('/http')) {
      url = url.substring(1).replace(':/', '://');
      console.log('requesting', url);
      return request(
        { url, followAllRedirects: true },
        (error, response, body) => {
          if (error) {
            console.log(error);
            return resolve(error.message);
          }
          console.log('res', body.length, body);

          resolve(body.replace(/href="\//g, 'href="' + url + '/'));
        }
      );
    }

    // otherwise send local files
    if (url.endsWith('/')) {
      url += 'index.html';
    }
    fs.readFile(`${__dirname}/public/${url}`, 'utf8', (error, body) => {
      console.log(`GET ${url} ${error ? '404' : '200'}`);
      if (error) {
        return resolve(errorPage({ url, host }));
      }

      return resolve(body);
    });
  });

const server = net.createServer(c => {
  // 'connection' listener

  console.log(`client connection ${c.remoteAddress}`);
  c.on('end', () => {
    console.log('client disconnected');
  });
  c.on('data', data => {
    const http1 = data.toString().includes('HTTP/1.1');

    let [, url] = data
      .toString()
      .trim()
      .split(' ');
    try {
      url = clean(url);
      fake09(url).then(body => {
        if (http1) {
          c.write('HTTP/1.1 200 OK\n\n');
        } else {
          c.write('\n');
        }
        c.write(body + '\n\n', () => {
          // wait until all sent before closing connection
          c.destroy();
        });
      });
    } catch (e) {
      console.error(e);
      c.write(errorPage({ url, host }), () => c.destroy());
    }
  });
});

server.on('error', err => {
  throw err;
});

server.listen(process.env.PORT || 8124, () => {
  console.log('server bound');
});
