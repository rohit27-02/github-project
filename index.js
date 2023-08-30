const { Probot } = require('probot');
const axios = require('axios');
const crypto = require('crypto');

require('dotenv').config();

const app = new Probot({
  appId: process.env.APP_ID,
  privateKey: process.env.PRIVATE_KEY,
  secret: process.env.WEBHOOK_SECRET,
});

// Helper function to verify the signature of incoming webhooks
function verifySignature(signature, payload) {
  const secret = process.env.WEBHOOK_SECRET;
  const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${hash}` === signature;
}

app.on('issue_comment.created', async context => {
  try {
    // Verify the signature of the incoming webhook
    const signature = context.req.headers['x-hub-signature-256'];
    if (!verifySignature(signature, context.req.rawBody)) {
      return context.res.status(400).send('Invalid signature');
    }

    // Ensure the comment is from a user, not the bot itself
    if (context.payload.sender.type !== 'Bot') {
      const comment = context.payload.comment;
      const repoFullName = context.payload.repository.full_name;

      // Check for the "/execute" command
      if (comment.body.includes('/execute')) {
        // Fetch the code from the comment using a regex
        const codeRegex = /```([\s\S]*?)```/m;
        const codeMatch = comment.body.match(codeRegex);

        if (codeMatch) {
          const code = codeMatch[1];

          // Execute the code using an external service (e.g., PISTON API)
          const response = await axios.post('https://emkc.org/api/v2/piston/execute', { code });
          const output = response.data.output || 'No output available';

          // Post the code output as a comment on the issue
          await context.github.issues.createComment({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            issue_number: context.payload.issue.number,
            body: `Code Output:\n\n${output}`,
          });
        } else {
          const errorMessage = 'No code block found in the comment.';
          await context.github.issues.createComment({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            issue_number: context.payload.issue.number,
            body: errorMessage,
          });
        }
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    const errorMessage = 'An error occurred while processing the request.';
    await context.github.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: context.payload.issue.number,
      body: errorMessage,
    });
  }
});

module.exports = app;
