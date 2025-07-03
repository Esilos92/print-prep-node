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

// 🎯 ENHANCED: Parse YOUR EXACT backend output patterns for progress
function parseProgressFromOutput(job, output) {
  job.addLog(`Output: ${output.trim()}`);

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

// 🎯 FIX #5: Enhanced job completion with better file detection
async function handleJobCompletion(job) {
  try {
    // 🎯 ENHANCED: Multiple file name patterns to check
    const today = new Date().toISOString().split('T')[0];
    const possibleFileNames = [
      `${job.celebrity.replace(/\s+/g, '_')}_${today}.zip`,
      `${job.celebrity.replace(/\s+/g, '_')}.zip`,
      `${job.celebrity.replace(/[^a-zA-Z0-9]/g, '_')}_${today}.zip`,
      `${job.celebrity.replace(/[^a-zA-Z0-9]/g, '_')}.zip`
    ];
    
    job.addLog(`Looking for output files: ${possibleFileNames.join(', ')}`);
    
    // 🎯 ENHANCED: Check multiple locations and file patterns
    let foundFile = null;
    let foundPath = null;
    
    for (const fileName of possibleFileNames) {
      const possiblePaths = [
        path.join(__dirname, fileName),
        path.join(__dirname, 'output', fileName),
        path.join(__dirname, 'downloads', fileName),
        path.join(__dirname, '..', fileName) // Parent directory
      ];
      
      for (const filePath of possiblePaths) {
        try {
          const stats = await fs.stat(filePath);
          if (stats.size > 1000) { // Ensure file is not empty
            foundFile = fileName;
            foundPath = filePath;
            job.addLog(`Found output file: ${fileName} at ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            break;
          }
        } catch {
          // File doesn't exist at this path, continue
        }
      }
      
      if (foundFile) break;
    }
    
    // 🎯 ENHANCED: Retry logic with longer timeout for large files
    if (!foundFile) {
      job.addLog('File not found immediately, waiting for completion...');
      for (let i = 0; i < 20; i++) { // 40 seconds total (20 × 2s)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        for (const fileName of possibleFileNames) {
          const possiblePaths = [
            path.join(__dirname, fileName),
            path.join(__dirname, 'output', fileName),
            path.join(__dirname, 'downloads', fileName)
          ];
          
          for (const filePath of possiblePaths) {
            try {
              const stats = await fs.stat(filePath);
              if (stats.size > 1000) {
                foundFile = fileName;
                foundPath = filePath;
                job.addLog(`Found delayed output file: ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
                break;
              }
            } catch {
              // Continue searching
            }
          }
          
          if (foundFile) break;
        }
        
        if (foundFile) break;
      }
    }

    if (foundFile) {
      // 🎯 ENHANCED: Copy file to download directory for serving
      const downloadDir = path.join(__dirname, 'downloads');
      await fs.mkdir(downloadDir, { recursive: true });
      const downloadPath = path.join(downloadDir, foundFile);
      
      if (foundPath !== downloadPath) {
        await fs.copyFile(foundPath, downloadPath);
        job.addLog(`Copied file to download directory: ${foundFile}`);
      }
      
      job.complete(`http://159.223.131.137:4000/download/${foundFile}`);
    } else {
      job.addLog(`Output file not found after extended search`);
      throw new Error('Output file not found - process may have failed');
    }
  } catch (error) {
    job.error(`Completion error: ${error.message}`);
  }
}

// Serve download files from downloads directory
app.get('/download/:filename', async (req, res) => {
  const filename = req.params.filename;
  const downloadDir = path.join(__dirname, 'downloads');
  const filePath = path.join(downloadDir, filename);
  
  try {
    await fs.access(filePath);
    res.download(filePath);
  } catch {
    // Fallback to root directory
    const rootPath = path.join(__dirname, filename);
    try {
      await fs.access(rootPath);
      res.download(rootPath);
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
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
