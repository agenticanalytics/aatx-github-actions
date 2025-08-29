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

    // Validate response structure
    if (!result || typeof result !== 'object') {
      throw new Error('Invalid response format from validation API');
    }

    // Log validation results
    core.info(`Validation completed with ${result.valid ? 'success' : 'errors'}`);
    core.info(`Total events: ${result.summary?.totalEvents || 0}`);
    core.info(`Valid events: ${result.summary?.validEvents || 0}`);
    core.info(`Invalid events: ${result.summary?.invalidEvents || 0}`);
    core.info(`Missing events: ${result.summary?.missingEvents || 0}`);
    core.info(`New events: ${result.summary?.newEvents || 0}`);

    if (result.trackingPlanUpdated) {
      core.info('Tracking plan was automatically updated with new events');
    }

    // Log detailed information about invalid events
    const invalidEvents = result.events?.filter(e => e.status === 'invalid') || [];
    if (invalidEvents.length > 0) {
      core.warning(`\n❌ INVALID EVENTS (${invalidEvents.length}):`);
      invalidEvents.forEach((event, index) => {
        core.warning(`\n${index + 1}. Event: ${event.name}`);
        if (event.message) {
          core.warning(`   Error: ${event.message}`);
        }
        if (event.implementation && event.implementation.length > 0) {
          const impl = event.implementation[0];
          core.warning(`   Location: ${impl.path}:${impl.line}`);
          if (impl.code) {
            core.warning(`   Code: ${impl.code.trim()}`);
          }
        }
        if (event.properties && Object.keys(event.properties).length > 0) {
          core.warning(`   Required Properties: ${Object.keys(event.properties).join(', ')}`);
        }
      });
    }

    // Log detailed information about missing events
    const missingEvents = result.events?.filter(e => e.status === 'missing') || [];
    if (missingEvents.length > 0) {
      core.warning(`\n⚠️ MISSING EVENTS (${missingEvents.length}):`);
      missingEvents.forEach((event, index) => {
        core.warning(`\n${index + 1}. Event: ${event.name}`);
        if (event.message) {
          core.warning(`   Note: ${event.message}`);
        }
        if (event.properties && Object.keys(event.properties).length > 0) {
          core.warning(`   Required Properties: ${Object.keys(event.properties).join(', ')}`);
        }
      });
    }

    // Log detailed information about new events
    const newEvents = result.events?.filter(e => e.status === 'new') || [];
    if (newEvents.length > 0) {
      core.info(`\n🆕 NEW EVENTS (${newEvents.length}):`);
      newEvents.forEach((event, index) => {
        core.info(`\n${index + 1}. Event: ${event.name}`);
        if (event.implementation && event.implementation.length > 0) {
          const impl = event.implementation[0];
          core.info(`   Location: ${impl.path}:${impl.line}`);
          if (impl.code) {
            core.info(`   Code: ${impl.code.trim()}`);
          }
        }
        if (event.properties && Object.keys(event.properties).length > 0) {
          core.info(`   Detected Properties: ${Object.keys(event.properties).join(', ')}`);
        }
      });
    }

    // Set output variables
    core.setOutput('valid', result.valid);
    core.setOutput('total_events', result.summary?.totalEvents || 0);
    core.setOutput('valid_events', result.summary?.validEvents || 0);
    core.setOutput('invalid_events', result.summary?.invalidEvents || 0);
    core.setOutput('missing_events', result.summary?.missingEvents || 0);
    core.setOutput('new_events', result.summary?.newEvents || 0);
    core.setOutput('tracking_plan_updated', result.trackingPlanUpdated || false);

    // Add PR review comments if enabled
    if (comment && context.payload.pull_request) {
      await addPrReviewComments(result);
    }

    // Fail the action if invalid events are found and failOnInvalid is true
    if (!result.valid && failOnInvalid) {
      const invalidCount = result.summary?.invalidEvents || 0;
      const missingCount = result.summary?.missingEvents || 0;
      
      let errorMessage = `❌ Validation failed with ${invalidCount} invalid events and ${missingCount} missing events`;
      
      if (invalidCount > 0) {
        errorMessage += `\n\nInvalid events: ${invalidEvents.map(e => e.name).join(', ')}`;
      }
      
      if (missingCount > 0) {
        errorMessage += `\n\nMissing events: ${missingEvents.map(e => e.name).join(', ')}`;
      }
      
      errorMessage += '\n\nSee the detailed output above for specific issues and locations.';
      
      core.setFailed(errorMessage);
    }

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
    if (error.response) {
      core.error(`Response status: ${error.response.status}`);
      core.error(`Response data: ${JSON.stringify(error.response.data)}`);
    }
  }
}

async function addPrReviewComments(result) {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      core.warning('GITHUB_TOKEN not available, skipping PR review comments');
      return;
    }

    const octokit = github.getOctokit(token);
    const context = github.context;
    const { owner, repo } = context.repo;
    const prNumber = context.payload.pull_request.number;

    // Prepare review comments for invalid and new events
    const reviewComments = [];

    // Add comments for invalid events
    const invalidEvents = result.events?.filter(e => e.status === 'invalid') || [];
    for (const event of invalidEvents) {
      if (event.implementation && event.implementation.length > 0) {
        const impl = event.implementation[0];
        reviewComments.push({
          path: impl.path,
          line: impl.line,
          body: `❌ **Invalid Event**: \`${event.name}\`\n\n${event.message || 'Event does not match tracking plan'}\n\n**Required Properties**: ${event.properties ? Object.keys(event.properties).join(', ') : 'None specified'}`
        });
      }
    }

    // Add comments for new events (optional - you might want to highlight these)
    const newEvents = result.events?.filter(e => e.status === 'new') || [];
    for (const event of newEvents) {
      if (event.implementation && event.implementation.length > 0) {
        const impl = event.implementation[0];
        reviewComments.push({
          path: impl.path,
          line: impl.line,
          body: `🆕 **New Event**: \`${event.name}\`\n\n${event.message || 'Event found in codebase but not in tracking plan'}\n\n**Properties**: ${event.properties ? Object.keys(event.properties).join(', ') : 'None detected'}`
        });
      }
    }

    // Add comments for missing events (general comment since no specific line)
    const missingEvents = result.events?.filter(e => e.status === 'missing') || [];
    if (missingEvents.length > 0) {
      const missingEventNames = missingEvents.map(e => `\`${e.name}\``).join(', ');
      reviewComments.push({
        path: 'README.md', // Use a common file for general comments
        line: 1,
        body: `⚠️ **Missing Events**: The following events are defined in the tracking plan but not found in the codebase:\n\n${missingEventNames}\n\nPlease implement these events or remove them from the tracking plan.`
      });
    }

    // Create the review
    if (reviewComments.length > 0) {
      const reviewBody = `## AATX Tracking Plan Validation Review
      
- **Total Events**: ${result.summary?.totalEvents || 0}
- **Valid Events**: ${result.summary?.validEvents || 0}
- **Invalid Events**: ${result.summary?.invalidEvents || 0}
- **Missing Events**: ${result.summary?.missingEvents || 0}
- **New Events**: ${result.summary?.newEvents || 0}

${result.trackingPlanUpdated ? '✅ Tracking plan was automatically updated with new events' : ''}
${!result.valid ? '❌ Some events do not match the tracking plan' : '✅ All events match the tracking plan'}

${result.metadata?.validationDuration ? `\n**Validation Duration**: ${result.metadata.validationDuration}ms` : ''}
${result.metadata?.agentVersion ? `\n**Agent Version**: ${result.metadata.agentVersion}` : ''}`;

      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        body: reviewBody,
        event: result.summary?.invalidEvents > 0 ? "REQUEST_CHANGES" : "COMMENT",
        comments: reviewComments
      });

      core.info(`Created PR review with ${reviewComments.length} comments`);
    } else {
      core.info('No review comments to add');
    }

  } catch (error) {
    core.warning(`Failed to add PR review comments: ${error.message}`);
    if (error.response) {
      core.error(`GitHub API response: ${JSON.stringify(error.response.data)}`);
    }
  }
}

run();