/**
 * Finish line 등록 테스트 (Node.js)
 * 실행: node test-finish-line.js
 */

const http = require('http');

const data = JSON.stringify({
  requestId: '20260311-UWKAQBCR',
  filePath: '20260311-UWKAQBCR-거제-이지운-16.stl',
  finishLine: {
    points: [
      [0, 0, 5],
      [1, 0, 5],
      [0, 1, 5]
    ]
  }
});

const options = {
  hostname: 'localhost',
  port: 8080,
  path: '/api/bg/register-finish-line',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'X-Bridge-Secret': 'YOUR_SECRET'
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers)}`);
  
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    console.log('Response body:');
    console.log(body);
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

console.log('Sending finish line registration request...');
console.log('Request body:', data);
req.write(data);
req.end();
