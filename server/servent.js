import { Worker } from 'bullmq';

const worker = new Worker('upload-file-queue', async job => {
    console.log(`JOB:${job.data}`);
    const data=JSON.parse(job.data);
}, { concurrency: 100 , connection:{
    host: 'localhost',
    port: '6379'
}
 });


