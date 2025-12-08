import { describe, it, expect } from 'vitest';
import axios from 'axios';

/**
 * Test Green API Credentials
 * 
 * This test validates that the GREEN_API_INSTANCE_ID and GREEN_API_TOKEN
 * environment variables are set correctly and can connect to Green API.
 */

describe('Green API Credentials', () => {
  it('should have GREEN_API_INSTANCE_ID and GREEN_API_TOKEN set', () => {
    expect(process.env.GREEN_API_INSTANCE_ID).toBeDefined();
    expect(process.env.GREEN_API_TOKEN).toBeDefined();
    expect(process.env.GREEN_API_INSTANCE_ID).not.toBe('');
    expect(process.env.GREEN_API_TOKEN).not.toBe('');
  });

  it('should successfully connect to Green API and get instance state', async () => {
    const instanceId = process.env.GREEN_API_INSTANCE_ID;
    const token = process.env.GREEN_API_TOKEN;

    expect(instanceId).toBeDefined();
    expect(token).toBeDefined();

    const baseURL = `https://api.green-api.com/waInstance${instanceId}/${token}`;

    try {
      // Test connection by getting instance state
      const response = await axios.get(`${baseURL}/getStateInstance`, {
        timeout: 10000, // 10 seconds timeout
      });

      // Should get a valid response
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data.stateInstance).toBeDefined();

      // Log the state for debugging
      console.log('✅ Green API Connection Successful!');
      console.log('Instance State:', response.data.stateInstance);
      
      // Valid states: notAuthorized, authorized, blocked, sleepMode, starting
      const validStates = ['notAuthorized', 'authorized', 'blocked', 'sleepMode', 'starting'];
      expect(validStates).toContain(response.data.stateInstance);

    } catch (error: any) {
      if (error.response) {
        // Green API returned an error
        console.error('❌ Green API Error:', error.response.status, error.response.data);
        throw new Error(`Green API returned error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        // No response received
        console.error('❌ No response from Green API');
        throw new Error('Could not connect to Green API - check your internet connection');
      } else {
        // Other error
        console.error('❌ Error:', error.message);
        throw error;
      }
    }
  }, 15000); // 15 seconds timeout for the test
});
