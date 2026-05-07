import cron from 'node-cron';
import { applyFile, cronSchedule, isFeatureEnabled } from './src/config';
import actualAi from './src/container';

if (applyFile) {
  (async () => {
    await actualAi.applyFromFile(applyFile);
  })();
} else {
  if (!isFeatureEnabled('classifyOnStartup') && !cron.validate(cronSchedule)) {
    console.error('classifyOnStartup not set or invalid cron schedule:', cronSchedule);
    process.exit(1);
  }

  if (cron.validate(cronSchedule)) {
    cron.schedule(cronSchedule, async () => {
      await actualAi.classify();
    });
  }

  console.log('Application started');
  if (isFeatureEnabled('classifyOnStartup')) {
    (async () => {
      await actualAi.classify();
    })();
  } else {
    console.log('Application started, waiting for cron schedule:', cronSchedule);
  }
}
