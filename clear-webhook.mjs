import axios from 'axios';

const instanceId = '7105411382';
const apiToken = process.env.GREEN_API_TOKEN || 'YOUR_TOKEN_HERE';

async function clearWebhook() {
  try {
    const instancePrefix = instanceId.substring(0, 4);
    const baseURL = `https://${instancePrefix}.api.greenapi.com/waInstance${instanceId}`;
    
    console.log(`Clearing webhook URL for instance ${instanceId}...`);
    console.log(`URL: ${baseURL}/setSettings/${apiToken}`);
    
    const response = await axios.post(`${baseURL}/setSettings/${apiToken}`, {
      webhookUrl: '',
      webhookUrlToken: '',
      outgoingWebhook: 'no',
      outgoingMessageWebhook: 'no',
      outgoingAPIMessageWebhook: 'no',
      incomingWebhook: 'no',
      deviceWebhook: 'no',
      statusInstanceWebhook: 'no',
      stateWebhook: 'no',
    });

    console.log('Response:', response.data);
    console.log('Webhook cleared successfully!');
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

clearWebhook();
