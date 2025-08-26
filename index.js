const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

async function run() {
  try {
    // Get inputs
    const apiKey = core.getInput('api-key', { required: true });
    const trackingPlanId = core.getInput('tracking-plan-id', { required: true });
    const apiUrl = core.getInput('api-url');
    const holistic = core.getBooleanInput('holistic');
    const delta = core.getBooleanInput('delta');
    const autoUpdate = core.getBooleanInput('auto-update');
    const overwrite = core.getBooleanInput('overwrite');
    const comment = core.getBooleanInput('comment');
    const failOnInvalid = core.getBooleanInput('fail-on-invalid');
    
    // Get GitHub context
    const context = github.context;
    const { owner, repo } = context.repo;
    const repositoryUrl = `https://github.com/${owner}/${repo}`;
    
    // Prepare PR details if available
    let prDetails = {};
    if (context.payload.pull_request) {
      prDetails = {
        prNumber: context.payload.pull_request.number,
        headSha: context.payload.pull_request.head.sha,
        baseSha: context.payload.pull_request.base.sha,
      };
    }
    
    // Prepare validation request
    const validationRequest = {
      repositoryUrl,
      trackingPlanId,
      options: {
        holistic,
        delta,
        autoUpdateTrackingPlan: autoUpdate,
        overwriteExisting: overwrite,
        comment,
      },
      prDetails,
    };
    
    // Call validation API
    const validationEndpoint = `${apiUrl}/api/github-action/validate`;
    core.info(`Calling validation endpoint: ${validationEndpoint}`);
    
    const response = await axios.post(validationEndpoint, validationRequest, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AATX-GitHub-Action',
      },
    });
    
    const result = response.data;
    
    // Log validation results
    core.info(`Validation completed with ${result.valid ? 'success' : 'errors'}`);
    core.info(`Total events: ${result.summary.totalEvents}`);
    core.info(`Valid events: ${result.summary.validEvents}`);
    core.info(`Invalid events: ${result.summary.invalidEvents}`);
    core.info(`Missing events: ${result.summary.missingEvents}`);
    core.info(`New events: ${result.summary.newEvents}`);
    
    if (result.trackingPlanUpdated) {
      core.info('Tracking plan was automatically updated with new events');
    }
    
    // Set output variables
    core.setOutput('valid', result.valid);
    core.setOutput('total_events', result.summary.totalEvents);
    core.setOutput('valid_events', result.summary.validEvents);
    core.setOutput('invalid_events', result.summary.invalidEvents);
    core.setOutput('missing_events', result.summary.missingEvents);
    core.setOutput('new_events', result.summary.newEvents);
    core.setOutput('tracking_plan_updated', result.trackingPlanUpdated || false);
    
    // Add PR comments if enabled
    if (comment && context.payload.pull_request) {
      await addPrComments(result);
    }
    
    // Fail the action if invalid events are found and failOnInvalid is true
    if (!result.valid && failOnInvalid) {
      core.setFailed(`Validation failed with ${result.summary.invalidEvents} invalid events and ${result.summary.missingEvents} missing events`);
    }
    
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
    if (error.response) {
      core.error(`Response status: ${error.response.status}`);
      core.error(`Response data: ${JSON.stringify(error.response.data)}`);
    }
  }
}

async function addPrComments(result) {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      core.warning('GITHUB_TOKEN not available, skipping PR comments');
      return;
    }
    
    const octokit = github.getOctokit(token);
    const context = github.context;
    const { owner, repo } = context.repo;
    const prNumber = context.payload.pull_request.number;
    
    // Create summary comment
    const summaryBody = `## AATX Tracking Plan Validation Results
    
- **Total Events**: ${result.summary.totalEvents}
- **Valid Events**: ${result.summary.validEvents}
- **Invalid Events**: ${result.summary.invalidEvents}
- **Missing Events**: ${result.summary.missingEvents}
- **New Events**: ${result.summary.newEvents}

${result.trackingPlanUpdated ? '✅ Tracking plan was automatically updated with new events' : ''}
${!result.valid ? '❌ Some events do not match the tracking plan' : '✅ All events match the tracking plan'}`;
    
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: summaryBody,
    });
    
    // Add comments for invalid events
    const invalidEvents = result.events.filter(e => e.status === 'invalid');
    if (invalidEvents.length > 0) {
      for (const event of invalidEvents) {
        if (event.implementation && event.implementation.length > 0) {
          const impl = event.implementation[0];
          const body = `❌ **Invalid Event**: \`${event.name}\`
          
${event.message || 'Event does not match tracking plan'}

Found in file: \`${impl.path}\` at line ${impl.line}`;
          
          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body,
          });
        }
      }
    }
    
  } catch (error) {
    core.warning(`Failed to add PR comments: ${error.message}`);
  }
}

run();
