# AATX Tracking Plan Validator

This GitHub Action validates your analytics tracking code against a central tracking plan managed in AATX. It helps ensure that your analytics implementation stays in sync with your tracking plan, catching issues early in the development process.

## Features

- **Holistic Validation**: Scan your entire codebase to ensure it follows your tracking plan
- **Delta Validation**: Only scan files changed in a PR to validate new or modified tracking code
- **Auto-Update**: Automatically update your tracking plan with newly detected events
- **PR Comments**: Leave helpful comments on PRs when tracking code doesn't match the plan
- **Fail on Invalid**: Optionally fail the GitHub Action if invalid events are found

## Setup

1. **Generate an API Key**: Create an API key in your AATX dashboard
2. **Add Secrets**: Add your API key as a secret in your GitHub repository
3. **Create Workflow**: Add the GitHub Action to your workflow

## Usage

Create a workflow file (e.g., `.github/workflows/tracking-validation.yml`) with the following content:

```yaml
name: Tracking Plan Validation

on:
  pull_request:
    branches: [ main, master ]
    
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0  # Required for delta validation
          
      - name: Validate Tracking Plan
        uses: aatx/tracking-plan-validator@v1
        with:
          api-key: ${{ secrets.AATX_API_KEY }}
          tracking-plan-id: 'your-tracking-plan-id'
          holistic: true
          delta: true
          auto-update: false
          comment: true
          fail-on-invalid: true
```

## Configuration Options

| Option | Description | Default | Required |
|--------|-------------|---------|----------|
| `api-key` | API key for authentication | - | Yes |
| `tracking-plan-id` | ID of the tracking plan to validate against | - | Yes |
| `api-url` | URL of the AATX API | `https://app.aatx.ai` | No |
| `holistic` | Scan the entire codebase regardless of PR changes | `true` | No |
| `delta` | Only scan files changed in the PR | `false` | No |
| `auto-update` | Automatically update tracking plan with new events | `false` | No |
| `overwrite` | Overwrite existing events in tracking plan | `false` | No |
| `comment` | Leave comments on PR for mismatched events | `false` | No |
| `fail-on-invalid` | Fail the GitHub Action if invalid events are found | `true` | No |

## Outputs

| Output | Description |
|--------|-------------|
| `valid` | Whether all events match the tracking plan |
| `total_events` | Total number of events found |
| `valid_events` | Number of valid events |
| `invalid_events` | Number of invalid events |
| `missing_events` | Number of events in tracking plan but missing in code |
| `new_events` | Number of new events found in code but not in tracking plan |
| `tracking_plan_updated` | Whether the tracking plan was updated |

## Example Workflow with Outputs

```yaml
name: Tracking Plan Validation

on:
  pull_request:
    branches: [ main, master ]
    
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0
          
      - name: Validate Tracking Plan
        id: validate
        uses: aatx/tracking-plan-validator@v1
        with:
          api-key: ${{ secrets.AATX_API_KEY }}
          tracking-plan-id: 'your-tracking-plan-id'
          
      - name: Check Results
        run: |
          echo "Valid: ${{ steps.validate.outputs.valid }}"
          echo "Total Events: ${{ steps.validate.outputs.total_events }}"
          echo "Valid Events: ${{ steps.validate.outputs.valid_events }}"
          echo "Invalid Events: ${{ steps.validate.outputs.invalid_events }}"
          echo "Missing Events: ${{ steps.validate.outputs.missing_events }}"
          echo "New Events: ${{ steps.validate.outputs.new_events }}"
          echo "Tracking Plan Updated: ${{ steps.validate.outputs.tracking_plan_updated }}"
```

## Permissions

If you're using the `comment` feature, the GitHub Action needs permission to write comments on PRs. Add the following to your workflow:

```yaml
permissions:
  pull-requests: write
```

## Support

For questions or issues, please contact support@aatx.ai or open an issue in the GitHub repository.
