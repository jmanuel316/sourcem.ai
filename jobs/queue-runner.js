const Queue = require('../db/queue');
const { sendThrottledEmail } = require('../services/email-proxy');
const log = require('../services/observability/log');

async function runWorker() {
  while (true) {
    try {
      // Pull tasks systematically + micro-batches 3 to process sequentially
      const tasks = await Queue.reserveTasks('send_outbound_email', 3);

      if (tasks.length === 0) {
        // No work to do? Sleep for 10 seconds before checking the database again
        await new Promise(resolve => setTimeout(resolve, 10000));
        continue;
      }

      for (const task of tasks) {
        try {
          log.info(`Processing task ${task.id} for execution.`);
          
          // Execute delivery through throttled proxy service
          await sendThrottledEmail(task.payload);
          
          // Drop it from queue database
          await Queue.complete(task.id);
          log.info(`Task ${task.id} successfully executed and cleared.`);
          
        } catch (taskError) {
          // If a specific email fails, catch it, log metrics, and schedule backoff
          log.error(`Task ${task.id} failed natively: ${taskError.message}`);
          await Queue.fail(task.id, task.attempts, taskError.message);
        }
      }

    } catch (globalError) {
      log.error(`Queue Runner encountered a structural loop error: ${globalError.message}`);
      // Safety pause to keep database connection limits happy if things crash
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
}

// Start worker immediately when process calls this file
runWorker();