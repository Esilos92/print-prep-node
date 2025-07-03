// api-server.js - NEW FILE to add to ~/print-prep-node/
// This runs alongside your existing CLI system

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

const app = express();
app.use(cors());
app.use(express.json());

// Job tracking in memory (will persist in files later)
const activeJobs = new Map();
const completedJobs = new Map();

// Job status interface
class JobTracker {
  constructor(id, celebrity) {
    this.id = id;
    this.celebrity = celebrity;
    this.status = 'running';
    this.progress = 0;
    this.currentPhase = 'Initializing AI systems...';
    this.roles = null;
    this.imagesProcessed = 0;
    this.imagesValidated = 0;
    this.startTime = new Date();
    this.endTime = null;
    this.downloadLink = null;
    this.process = null;
    this.logs = [];
  }

  updateProgress(progress, phase) {
    this.progress = progress;
    this.currentPhase = phase;
    this.addLog(`Progress: ${progress}% - ${phase}`);
  }

  addLog(message) {
    this.logs.push({
      timestamp: new Date(),
      message: message
    });
    console.log(`[Job ${this.id}] ${message}`);
  }

  complete(downloadLink = null) {
    this.status = 'completed';
    this.progress = 100;
    this.currentPhase = 'Mission Complete!';
    this.endTime = new Date();
    this.downloadLink = downloadLink;
    this.addLog('Job completed successfully');
    
    // Move to completed jobs
    completedJobs.set(this.id, this);
    activeJobs.delete(this.id);
  }

  error(errorMessage) {
    this.status = 'error';
    this.currentPhase = `Error: ${errorMessage}`;
    this.endTime = new Date();
    this.addLog(`Job failed: ${errorMessage}`);
    
    // Move to completed jobs (even if failed)
    completedJobs.set(this.id, this);
    activeJobs.delete(this.id);
  }
}

// API ENDPOINTS

// 1. Start new celebrity job
app.post('/api/jobs', async (req, res) => {
  const { celebrity } = req.body;
  
  if (!celebrity || !celebrity.trim()) {
    return res.status(400).json({ error: 'Celebrity name is required' });
  }

  // Generate unique job ID
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Create job tracker
  const job = new JobTracker(jobId, celebrity.trim());
  activeJobs.set(jobId, job);

  try {
    // Start the background process (your existing CLI)
    const childProcess = spawn('node', ['index.js', celebrity], {
      cwd: __dirname, // ~/print-prep-node directory
      stdio: ['pipe', 'pipe', 'pipe']
    });

    job.process = childProcess;
    job.addLog(`Started processing for ${celebrity}`);

    // Monitor process output for progress
    monitorJobProgress(job, childProcess);

    res.json({
      jobId: jobId,
      status: 'started',
      celebrity: celebrity,
      message: 'Job started successfully'
    });

  } catch (error) {
    job.error(`Failed to start process: ${error.message}`);
    res.status(500).json({ error: 'Failed to start job' });
  }
});

// 2. Get job status
app.get('/api/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  // Check active jobs first
  let job = activeJobs.get(jobId);
  if (!job) {
    // Check completed jobs
    job = completedJobs.get(jobId);
  }

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Return job status (exclude process object)
  const { process, ...jobData } = job;
  res.json(jobData);
});

// 3. Get all jobs (for history)
app.get('/api/jobs', (req, res) => {
  const allJobs = [
    ...Array.from(activeJobs.values()),
    ...Array.from(completedJobs.values())
  ].sort((a, b) => b.startTime - a.startTime);

  // Remove process objects before sending
  const cleanJobs = allJobs.map(({ process, ...jobData }) => jobData);
  
  res.json(cleanJobs);
});

// 4. Get download link for completed job
app.get('/api/jobs/:jobId/download', async (req, res) => {
  const { jobId } = req.params;
  const job = completedJobs.get(jobId) || activeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'completed') {
    return res.status(400).json({ error: 'Job not completed yet' });
  }

  if (job.downloadLink) {
    res.json({ downloadUrl: job.downloadLink });
  } else {
    res.status(404).json({ error: 'Download link not available' });
  }
});

// 5. Cancel running job
app.delete('/api/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Active job not found' });
  }

  if (job.process) {
    job.process.kill('SIGTERM');
    job.error('Job cancelled by user');
  }

  res.json({ message: 'Job cancelled successfully' });
});

// PROGRESS MONITORING
function monitorJobProgress(job, process) {
  // Parse stdout for progress indicators
  process.stdout.on('data', (data) => {
    const output = data.toString();
    parseProgressFromOutput(job, output);
  });

  // Parse stderr for errors
  process.stderr.on('data', (data) => {
    const output = data.toString();
    job.addLog(`Error output: ${output}`);
  });

  // Handle process completion
  process.on('close', (code) => {
    if (code === 0) {
      // Success - look for output file
      handleJobCompletion(job);
    } else {
      job.error(`Process exited with code ${code}`);
    }
  });

  process.on('error', (error) => {
    job.error(`Process error: ${error.message}`);
  });
}

// Parse YOUR EXACT backend output patterns for progress
function parseProgressFromOutput(job, output) {
  job.addLog(`Output: ${output.trim()}`);

  // EXACT patterns from your backend files
  const progressPatterns = [
    { pattern: /🎬 Starting CHARACTER-FIRST image search for:/i, progress: 5, phase: 'Initializing CHARACTER-FIRST search...' },
    { pattern: /🔍 Verifying.*roles for/i, progress: 15, phase: 'Verifying discovered roles...' },
    { pattern: /✅.*roles verified as real/i, progress: 25, phase: 'Role verification complete' },
    { pattern: /🔍 Generating CHARACTER-FIRST search terms/i, progress: 35, phase: 'Optimizing search strategies...' },
    { pattern: /✅ CHARACTER-FIRST optimization/i, progress: 45, phase: 'Search optimization complete' },
    { pattern: /🖼️ AI-FIRST fetching for.*in/i, progress: 55, phase: 'Starting image search...' },
    { pattern: /🔍 SMART Search:/i, progress: 65, phase: 'Executing smart searches...' },
    { pattern: /📸 Found.*images for AI to evaluate/i, progress: 75, phase: 'Images found, preparing for AI...' },
    { pattern: /📥 Downloaded.*images for AI evaluation/i, progress: 85, phase: 'Images downloaded, AI analyzing...' },
    { pattern: /🤖 AI taking over/i, progress: 90, phase: 'AI validation in progress...' },
    { pattern: /✅ AI SELECTED:.*high-quality images/i, progress: 95, phase: 'AI validation complete' },
    { pattern: /✅.*processing complete.*optimized roles/i, progress: 98, phase: 'Finalizing package...' }
  ];

  // Extract role discoveries from YOUR exact format
  const roleDiscoveryMatch = output.match(/✅.*processing complete.*(\d+)\s*optimized roles/i);
  if (roleDiscoveryMatch) {
    const roleCount = parseInt(roleDiscoveryMatch[1]);
    // Create placeholder roles array
    job.roles = Array.from({length: Math.min(roleCount, 5)}, (_, i) => `Role ${i + 1}`);
    job.addLog(`Discovered ${roleCount} optimized roles`);
  }

  // Extract image counts from YOUR exact patterns
  const imagesFoundMatch = output.match(/📸 Found (\d+) images for AI to evaluate/i);
  if (imagesFoundMatch) {
    job.imagesProcessed = parseInt(imagesFoundMatch[1]);
    job.addLog(`Found ${job.imagesProcessed} images for evaluation`);
  }

  const imagesDownloadedMatch = output.match(/📥 Downloaded (\d+) images for AI evaluation/i);
  if (imagesDownloadedMatch) {
    job.imagesProcessed = parseInt(imagesDownloadedMatch[1]);
    job.addLog(`Downloaded ${job.imagesProcessed} images`);
  }

  const aiSelectedMatch = output.match(/✅ AI SELECTED: (\d+) high-quality images/i);
  if (aiSelectedMatch) {
    job.imagesValidated = parseInt(aiSelectedMatch[1]);
    job.addLog(`AI validated ${job.imagesValidated} high-quality images`);
  }

  // Update progress based on YOUR exact patterns
  for (const { pattern, progress, phase } of progressPatterns) {
    if (pattern.test(output)) {
      job.updateProgress(progress, phase);
      break;
    }
  }
}

// Handle job completion - look for YOUR exact output file pattern
async function handleJobCompletion(job) {
  try {
    // YOUR EXACT file naming pattern: Celebrity_Name_2025-07-02.zip
    const expectedFileName = `${job.celebrity.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.zip`;
    const outputPath = path.join(__dirname, expectedFileName);
    
    job.addLog(`Looking for output file: ${expectedFileName}`);
    
    // Check if file exists (with retries for file system delays)
    let fileExists = false;
    for (let i = 0; i < 15; i++) { // Increased retries for large zip files
      try {
        await fs.access(outputPath);
        const stats = await fs.stat(outputPath);
        if (stats.size > 1000) { // Ensure file is not empty
          fileExists = true;
          job.addLog(`Found output file: ${expectedFileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
          break;
        }
      } catch {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second intervals
      }
    }

    if (fileExists) {
      // File created successfully
      job.complete(`http://159.223.131.137:4000/download/${expectedFileName}`);
    } else {
      job.addLog(`Output file not found after 30 seconds: ${expectedFileName}`);
      throw new Error('Output file not found - process may have failed');
    }
  } catch (error) {
    job.error(`Completion error: ${error.message}`);
  }
}

// Serve download files
app.get('/download/:filename', async (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, filename);
  
  try {
    await fs.access(filePath);
    res.download(filePath);
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date(),
    activeJobs: activeJobs.size,
    completedJobs: completedJobs.size
  });
});

// Start the API server
const PORT = process.env.API_PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Celebrity Processing API running on port ${PORT}`);
  console.log(`📊 Dashboard should connect to: http://159.223.131.137:${PORT}`);
  console.log(`🔧 Health check: http://159.223.131.137:${PORT}/api/health`);
});

module.exports = { app, activeJobs, completedJobs };
