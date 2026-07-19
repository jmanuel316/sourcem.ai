module.exports = {
  name: 'add_tasks_queue',
  up: async (client) => {
    // 1. Create the custom task status enum if it doesn't exist yet
    await client.query(`
      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
              CREATE TYPE task_status AS ENUM ('pending', 'processing', 'completed', 'failed');
          END IF;
      END $$;
    `);

    // 2. Construct the async task queue table structure
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks_queue (
          id BIGSERIAL PRIMARY KEY,
          task_name VARCHAR(100) NOT NULL,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          status task_status NOT NULL DEFAULT 'pending',
          attempts INT NOT NULL DEFAULT 0,
          run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          error_log TEXT,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    // 3. Apply high-throughput indexes for the background polling loop
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_queue_poll 
      ON tasks_queue (task_name, run_at ASC) 
      WHERE status = 'pending';
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_queue_status 
      ON tasks_queue (status);
    `);
  }
};