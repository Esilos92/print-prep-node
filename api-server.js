// api-server.js - ENHANCED VERSION with 5 critical fixes
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

// 🎯 NEW: Persistent storage for download links and job data
const JOBS_DATA_FILE = path.join(__dirname, 'jobs_data.json');
const DOWNLOAD_LINKS_FILE = path.join(__dirname, 'download_links.json');

// 🎯 NEW: Load persistent data on startup
async function loadPersistedData() {
  try {
    // Load download links
    try {
      const linksData = await fs.readFile(DOWNLOAD_LINKS_FILE, 'utf8');
      const downloadLinks = JSON.parse(linksData);
      console.log(`📁 Loaded ${Object.keys(downloadLinks).length} download links from disk`);
    } catch (error) {
      console.log('📁 No existing download links file found (creating new)');
    }

    // Load completed jobs
    try {
      const jobsData = await fs.readFile(JOBS_DATA_FILE, 'utf8');
      const savedJobs = JSON.parse(jobsData);
      
      for (const jobData of savedJobs) {
        // Convert date strings back to Date objects
        if (jobData.startTime) jobData.startTime = new Date(jobData.startTime);
        if (jobData.endTime) jobData.endTime = new Date(jobData.endTime);
        
        completedJobs.set(jobData.id, jobData);
      }
      console.log(`📁 Loaded ${savedJobs.length} completed jobs from disk`);
    } catch (error) {
      console.log('📁 No existing jobs data file found (creating new)');
    }
  } catch (error) {
    console.error('📁 Error loading persisted data:', error);
  }
}

// 🎯 NEW: Save download link to persistent storage
async function saveDownloadLink(jobId, celebrity, downloadLink) {
  try {
    let downloadLinks = {};
    
    // Load existing links
    try {
      const data = await fs.readFile(DOWNLOAD_LINKS_FILE, 'utf8');
      downloadLinks = JSON.parse(data);
    } catch {
      // File doesn't exist yet, start with empty object
    }
    
    // Add new link
    downloadLinks[jobId] = {
      celebrity,
      downloadLink,
      timestamp: new Date().toISOString(),
      savedAt: Date.now()
    };
    
    // Save back to file
    await fs.writeFile(DOWNLOAD_LINKS_FILE, JSON.stringify(downloadLinks, null, 2));
    console.log(`💾 Saved download link for ${celebrity} (${jobId})`);
  } catch (error) {
    console.error('💾 Error saving download link:', error);
  }
}

// 🎯 NEW: Save completed job to persistent storage
async function saveCompletedJob(job) {
  try {
    // Get all completed jobs
    const allCompleted = Array.from(completedJobs.values());
    
    // Save to file (exclude process object)
    const jobsToSave = allCompleted.map(({ process, ...jobData }) => jobData);
    await fs.writeFile(JOBS_DATA_FILE, JSON.stringify(jobsToSave, null, 2));
    console.log(`💾 Saved ${jobsToSave.length} completed jobs to disk`);
  } catch (error) {
    console.error('💾 Error saving completed jobs:', error);
  }
}

// Job status interface
class JobTracker {
  constructor(id, celebrity) {
    this.id = id;
    this.celebrity = celebrity;
    this.status = 'running';
    this.progress = 0;
    this.currentPhase = 'Initializing AI systems...';
    this.roles = []; // 🎯 FIX #2: Real roles array instead of null
    this.imagesProcessed = 0;
    this.imagesValidated = 0;
    this.totalImagesAcrossRoles = 0; // 🎯 FIX #4: Cumulative tracking
    this.startTime = new Date();
    this.endTime = null;
    this.downloadLink = null;
    this.process = null;
    this.logs = [];
    this.currentPhaseForGBot = null; // 🎯 FIX #1: Track phase changes for GBot
    this.lastPhaseAnnounced = null; // 🎯 FIX #1: Prevent duplicate announcements
  }

  updateProgress(progress, phase) {
    this.progress = progress;
    this.currentPhase = phase;
    
    // 🎯 FIX #1: Detect phase changes for GBot announcements
    if (this.currentPhaseForGBot !== phase) {
      this.currentPhaseForGBot = phase;
      this.lastPhaseAnnounced = phase;
    }
    
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
    
    // 🎯 NEW: Save download link to persistent storage if available
    if (downloadLink) {
      saveDownloadLink(this.id, this.celebrity, downloadLink);
    }
    
    // Move to completed jobs
    completedJobs.set(this.id, this);
    activeJobs.delete(this.id);
    
    // 🎯 NEW: Save completed job to persistent storage
    saveCompletedJob(this);
  }

  error(errorMessage) {
    this.status = 'error';
    this.currentPhase = `Error: ${errorMessage}`;
    this.endTime = new Date();
    this.addLog(`Job failed: ${errorMessage}`);
    
    // Move to completed jobs (even if failed)
    completedJobs.set(this.id, this);
    activeJobs.delete(this.id);
    
    // 🎯 NEW: Save failed job to persistent storage
    saveCompletedJob(this);
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

// 4. Get download link for completed job with failsafe lookup
app.get('/api/jobs/:jobId/download', async (req, res) => {
  const { jobId } = req.params;
  const job = completedJobs.get(jobId) || activeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'completed') {
    return res.status(400).json({ error: 'Job not completed yet' });
  }

  // First check job's download link
  if (job.downloadLink) {
    return res.json({ downloadUrl: job.downloadLink });
  }

  // 🎯 NEW: Failsafe - check persistent storage for download link
  try {
    const linksData = await fs.readFile(DOWNLOAD_LINKS_FILE, 'utf8');
    const downloadLinks = JSON.parse(linksData);
    
    if (downloadLinks[jobId] && downloadLinks[jobId].downloadLink) {
      console.log(`🔄 Found download link in persistent storage for job ${jobId}`);
      return res.json({ downloadUrl: downloadLinks[jobId].downloadLink });
    }
  } catch (error) {
    console.warn('⚠️ Could not read download links file:', error.message);
  }

  return res.status(404).json({ error: 'Download link not available' });
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

// 🎯 ENHANCED: Parse YOUR EXACT backend output patterns for progress
function parseProgressFromOutput(job, output) {
  job.addLog(`Output: ${output.trim()}`);

  // 🎯 FIX #5: Extract Google Drive download link from output
  const googleDriveLinkMatch = output.match(/✅ Upload complete: (https:\/\/drive\.google\.com\/[^\s]+)/i);
  if (googleDriveLinkMatch) {
    job.downloadLink = googleDriveLinkMatch[1];
    job.addLog(`Google Drive link captured: ${job.downloadLink}`);
  }

  // 🎯 FIX #2: Extract REAL role names from backend output
  const roleExtractionPatterns = [
    // Pattern: "🖼️ AI-FIRST fetching for Ryan Reynolds in Deadpool..."
    /🖼️\s*AI-FIRST fetching for\s*(.+?)\s*in\s*(.+?)\.\.\./i,
    // Pattern: "✅ AI SELECTED: 15 high-quality images" (after a role context)
    /✅\s*AI SELECTED.*for\s*(.+?)\s*in\s*(.+)/i,
    // Pattern: "🔍 SMART Search: "Wade Wilson" "Deadpool""
    /🔍\s*SMART Search:.*["'](.+?)["'].*["'](.+?)["']/i
  ];

  for (const pattern of roleExtractionPatterns) {
    const match = output.match(pattern);
    if (match) {
      const character = match[1]?.trim();
      const title = match[2]?.trim();
      if (character && title) {
        const roleName = `${character} (${title})`;
        if (!job.roles.includes(roleName)) {
          job.roles.push(roleName);
          job.addLog(`Discovered role: ${roleName}`);
        }
      }
    }
  }

  // 🎯 FIX #4: Track CUMULATIVE image counts across all roles
  const imagesFoundMatch = output.match(/📸 Found (\d+) images for AI to evaluate/i);
  if (imagesFoundMatch) {
    const newImages = parseInt(imagesFoundMatch[1]);
    job.imagesProcessed += newImages; // Cumulative addition
    job.addLog(`Found ${newImages} more images (total: ${job.imagesProcessed})`);
  }

  const imagesDownloadedMatch = output.match(/📥 Downloaded (\d+) images for AI evaluation/i);
  if (imagesDownloadedMatch) {
    const downloadedImages = parseInt(imagesDownloadedMatch[1]);
    job.imagesProcessed = Math.max(job.imagesProcessed, downloadedImages); // Use max to avoid regression
    job.addLog(`Downloaded ${downloadedImages} images`);
  }

  const aiSelectedMatch = output.match(/✅ AI SELECTED: (\d+) high-quality images/i);
  if (aiSelectedMatch) {
    const validatedImages = parseInt(aiSelectedMatch[1]);
    job.totalImagesAcrossRoles += validatedImages; // 🎯 FIX #4: Cumulative validation
    job.imagesValidated = job.totalImagesAcrossRoles;
    job.addLog(`AI validated ${validatedImages} more images (total validated: ${job.imagesValidated})`);
  }

  // 🎯 ENHANCED: Better progress patterns with phase detection for GBot
  const progressPatterns = [
    { 
      pattern: /🎬 Starting CHARACTER-FIRST image search for:/i, 
      progress: 5, 
      phase: 'Initializing CHARACTER-FIRST search...',
      gBotPhase: 'filmography_scan'
    },
    { 
      pattern: /🔍 Verifying.*roles for/i, 
      progress: 15, 
      phase: 'Verifying discovered roles...',
      gBotPhase: 'performance_analysis'
    },
    { 
      pattern: /✅.*roles verified as real/i, 
      progress: 25, 
      phase: 'Role verification complete',
      gBotPhase: 'performance_analysis'
    },
    { 
      pattern: /🔍 Generating CHARACTER-FIRST search terms/i, 
      progress: 35, 
      phase: 'Optimizing search strategies...',
      gBotPhase: 'search_protocol'
    },
    { 
      pattern: /✅ CHARACTER-FIRST optimization/i, 
      progress: 45, 
      phase: 'Search optimization complete',
      gBotPhase: 'search_protocol'
    },
    { 
      pattern: /🖼️ AI-FIRST fetching for.*in/i, 
      progress: 55, 
      phase: 'Starting image search...',
      gBotPhase: 'image_download'
    },
    { 
      pattern: /🔍 SMART Search:/i, 
      progress: 65, 
      phase: 'Executing smart searches...',
      gBotPhase: 'image_download'
    },
    { 
      pattern: /📸 Found.*images for AI to evaluate/i, 
      progress: 75, 
      phase: 'Images found, preparing for AI...',
      gBotPhase: 'image_download'
    },
    { 
      pattern: /📥 Downloaded.*images for AI evaluation/i, 
      progress: 85, 
      phase: 'Images downloaded, AI analyzing...',
      gBotPhase: 'ai_validation'
    },
    { 
      pattern: /🤖 AI taking over/i, 
      progress: 90, 
      phase: 'AI validation in progress...',
      gBotPhase: 'ai_validation'
    },
    { 
      pattern: /✅ AI SELECTED:.*high-quality images/i, 
      progress: 95, 
      phase: 'AI validation complete',
      gBotPhase: 'ai_validation'
    },
    { 
      pattern: /✅.*processing complete.*optimized roles/i, 
      progress: 98, 
      phase: 'Finalizing package...',
      gBotPhase: 'file_compilation'
    }
  ];

  // Update progress based on YOUR exact patterns
  for (const { pattern, progress, phase, gBotPhase } of progressPatterns) {
    if (pattern.test(output)) {
      job.updateProgress(progress, phase);
      
      // 🎯 FIX #1: Mark phase changes for GBot announcements
      if (gBotPhase && job.currentPhaseForGBot !== gBotPhase) {
        job.currentPhaseForGBot = gBotPhase;
        job.gBotPhaseChange = gBotPhase; // Flag for frontend to detect
      }
      break;
    }
  }
}

// 🎯 FIX #5: Enhanced job completion using Google Drive link detection
async function handleJobCompletion(job) {
  try {
    // 🎯 NEW APPROACH: Check if we already captured Google Drive link during parsing
    if (job.downloadLink) {
      job.addLog(`Using captured Google Drive link: ${job.downloadLink}`);
      job.complete(job.downloadLink);
      return;
    }
    
    // 🎯 FALLBACK: Wait a bit more for Google Drive upload completion message
    job.addLog('Waiting for Google Drive upload completion...');
    
    // Wait up to 30 seconds for the Google Drive link to appear in logs
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if link was captured during this wait period
      if (job.downloadLink) {
        job.addLog(`Google Drive link found after ${i * 2} seconds`);
        job.complete(job.downloadLink);
        return;
      }
    }
    
    // 🎯 FINAL FALLBACK: Check recent logs for any Google Drive links
    const recentLogs = job.logs.slice(-10); // Last 10 log messages
    for (const log of recentLogs) {
      const linkMatch = log.message.match(/https:\/\/drive\.google\.com\/[^\s]+/);
      if (linkMatch) {
        const foundLink = linkMatch[0];
        job.addLog(`Found Google Drive link in recent logs: ${foundLink}`);
        job.complete(foundLink);
        return;
      }
    }
    
    // If no Google Drive link found, complete without download link
    job.addLog('No Google Drive link found, but process completed successfully');
    job.complete(null); // Complete but without download link
    
  } catch (error) {
    job.error(`Completion error: ${error.message}`);
  }
}

// Serve download files - redirect to Google Drive
app.get('/download/:filename', async (req, res) => {
  const filename = req.params.filename;
  
  // Since we're using Google Drive, we don't serve local files
  // Instead, we should redirect to the Google Drive link
  // This endpoint is mainly for backward compatibility
  
  res.status(404).json({ 
    error: 'Direct download not available. Files are stored on Google Drive.',
    message: 'Use the download link provided in the job status.'
  });
});

// 🎯 NEW: Admin endpoint to view all saved download links
app.get('/api/admin/download-links', async (req, res) => {
  try {
    const linksData = await fs.readFile(DOWNLOAD_LINKS_FILE, 'utf8');
    const downloadLinks = JSON.parse(linksData);
    res.json(downloadLinks);
  } catch (error) {
    res.json({});
  }
});

// 🎯 NEW: Admin endpoint to manually save a download link
app.post('/api/admin/download-links', async (req, res) => {
  const { jobId, celebrity, downloadLink } = req.body;
  
  if (!jobId || !celebrity || !downloadLink) {
    return res.status(400).json({ error: 'jobId, celebrity, and downloadLink are required' });
  }
  
  try {
    await saveDownloadLink(jobId, celebrity, downloadLink);
    res.json({ success: true, message: 'Download link saved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save download link' });
  }
});

// Health check with storage info
app.get('/api/health', async (req, res) => {
  // Check storage status
  let storageInfo = {
    downloadLinksFile: false,
    jobsDataFile: false,
    downloadLinksCount: 0,
    completedJobsCount: 0
  };

  try {
    await fs.access(DOWNLOAD_LINKS_FILE);
    storageInfo.downloadLinksFile = true;
    const linksData = await fs.readFile(DOWNLOAD_LINKS_FILE, 'utf8');
    const downloadLinks = JSON.parse(linksData);
    storageInfo.downloadLinksCount = Object.keys(downloadLinks).length;
  } catch {
    // File doesn't exist
  }

  try {
    await fs.access(JOBS_DATA_FILE);
    storageInfo.jobsDataFile = true;
    const jobsData = await fs.readFile(JOBS_DATA_FILE, 'utf8');
    const jobs = JSON.parse(jobsData);
    storageInfo.completedJobsCount = jobs.length;
  } catch {
    // File doesn't exist
  }

  res.json({ 
    status: 'healthy', 
    timestamp: new Date(),
    activeJobs: activeJobs.size,
    completedJobs: completedJobs.size,
    storage: storageInfo
  });
});

// Start the API server
const PORT = process.env.API_PORT || 4000;

// 🎯 NEW: Load persisted data before starting server
loadPersistedData().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Celebrity Processing API running on port ${PORT}`);
    console.log(`📊 Dashboard should connect to: http://159.223.131.137:${PORT}`);
    console.log(`🔧 Health check: http://159.223.131.137:${PORT}/api/health`);
    console.log(`💾 Persistent storage: ${JOBS_DATA_FILE}, ${DOWNLOAD_LINKS_FILE}`);
  });
}).catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

module.exports = { app, activeJobs, completedJobs };
