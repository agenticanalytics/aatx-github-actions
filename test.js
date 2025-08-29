/**
 * Test script for the GitHub Action tracking plan validator
 * 
 * Usage:
 * node test.js <api-key> <tracking-plan-id> <repository-url>
 */

const axios = require('axios');

// Get command line arguments
const apiKey = process.argv[2];
const trackingPlanId = process.argv[3];
const repositoryUrl = process.argv[4] || 'https://github.com/ahnopologetic/aatx';

if (!apiKey || !trackingPlanId) {
  console.error('Usage: node test.js <api-key> <tracking-plan-id> [repository-url]');
  process.exit(1);
}

// API endpoint (use local development server for testing)
const apiUrl = process.env.API_URL || 'http://localhost:3000';
const validationEndpoint = `${apiUrl}/api/github-action/validate`;

// Test validation request
const validationRequest = {
  repositoryUrl,
  trackingPlanId,
  options: {
    holistic: true,
    delta: false,
    autoUpdateTrackingPlan: false,
    overwriteExisting: false,
    comment: false,
  },
  prDetails: {
    prNumber: 123,
    headSha: 'test-head-sha',
    baseSha: 'test-base-sha',
  },
};

async function runTest() {
  console.log('Testing GitHub Action tracking plan validator...');
  console.log(`API URL: ${apiUrl}`);
  console.log(`Repository URL: ${repositoryUrl}`);
  console.log(`Tracking Plan ID: ${trackingPlanId}`);
  
  try {
    console.log('Sending validation request...');
    const response = await axios.post(validationEndpoint, validationRequest, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AATX-GitHub-Action-Test',
      },
    });
    
    console.log('\nValidation Results:');
    console.log('-------------------');
    console.log(`Status: ${response.status}`);
    console.log(`Valid: ${response.data.valid}`);
    console.log(`Total Events: ${response.data.summary?.totalEvents}`);
    console.log(`Valid Events: ${response.data.summary?.validEvents}`);
    console.log(`Invalid Events: ${response.data.summary?.invalidEvents}`);
    console.log(`Missing Events: ${response.data.summary?.missingEvents}`);
    console.log(`New Events: ${response.data.summary?.newEvents}`);
    
    if (response.data.trackingPlanUpdated) {
      console.log('Tracking plan was automatically updated with new events');
    }
    
    console.log('\nEvents:');
    response.data.events?.forEach(event => {
      console.log(`- ${event.name} (${event.status})`);
      if (event.message) {
        console.log(`  Message: ${event.message}`);
      }
      if (event.implementation && event.implementation.length > 0) {
        const impl = event.implementation[0];
        console.log(`  File: ${impl.path}:${impl.line}`);
      }
    });
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Test failed:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

runTest();
