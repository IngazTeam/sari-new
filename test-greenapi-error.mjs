import axios from 'axios';

const instanceId = '7105411382';
const token = 'test123'; // Wrong token to trigger error

const url = `https://api.green-api.com/waInstance${instanceId}/${token}/getStateInstance`;

console.log('Testing URL:', url);

try {
  const response = await axios.get(url, { timeout: 15000 });
  console.log('Success:', response.data);
} catch (error) {
  console.log('\n=== ERROR STRUCTURE ===');
  console.log('error.message:', error.message);
  console.log('error.code:', error.code);
  console.log('error.response?.status:', error.response?.status);
  console.log('error.response?.statusText:', error.response?.statusText);
  console.log('error.response?.data:', JSON.stringify(error.response?.data, null, 2));
}
