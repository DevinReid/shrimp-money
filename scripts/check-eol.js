#!/usr/bin/env node

/**
 * End-of-Life (EOL) Software Detection Script
 * 
 * This script checks for EOL software in the project by:
 * 1. Checking Node.js version against LTS schedule
 * 2. Checking npm packages for maintenance status
 * 3. Identifying outdated packages
 * 4. Reporting potential EOL components
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkNodeVersion() {
  try {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    log('\n📦 Node.js Version Check', 'cyan');
    log(`Current Version: ${nodeVersion}`, 'blue');
    
    // Node.js LTS schedule (simplified - should be updated regularly)
    const ltsSchedule = {
      18: { eol: '2025-04-30', status: 'LTS' },
      20: { eol: '2026-04-30', status: 'LTS' },
      22: { eol: '2027-04-30', status: 'Current' },
    };
    
    if (ltsSchedule[majorVersion]) {
      const info = ltsSchedule[majorVersion];
      const eolDate = new Date(info.eol);
      const today = new Date();
      const daysUntilEOL = Math.floor((eolDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysUntilEOL < 0) {
        log(`⚠️  WARNING: Node.js ${majorVersion} is EOL!`, 'red');
        log(`   EOL Date: ${info.eol}`, 'red');
        log(`   Action: Upgrade to supported LTS version immediately`, 'red');
        return { eol: true, severity: 'critical' };
      } else if (daysUntilEOL < 90) {
        log(`⚠️  WARNING: Node.js ${majorVersion} EOL approaching`, 'yellow');
        log(`   EOL Date: ${info.eol} (${daysUntilEOL} days)`, 'yellow');
        log(`   Action: Plan upgrade to supported LTS version`, 'yellow');
        return { eol: false, severity: 'high', daysUntilEOL };
      } else {
        log(`✅ Node.js ${majorVersion} is ${info.status}`, 'green');
        log(`   EOL Date: ${info.eol} (${daysUntilEOL} days remaining)`, 'green');
        return { eol: false, severity: 'low' };
      }
    } else {
      log(`⚠️  Unknown Node.js version ${majorVersion}`, 'yellow');
      log(`   Action: Check Node.js LTS schedule`, 'yellow');
      return { eol: false, severity: 'medium' };
    }
  } catch (error) {
    log(`❌ Error checking Node.js version: ${error.message}`, 'red');
    return { eol: false, severity: 'unknown', error: error.message };
  }
}

function checkOutdatedPackages() {
  try {
    log('\n📦 Checking for Outdated Packages', 'cyan');
    
    const packageJsonPath = path.join(process.cwd(), 'app', 'frontend', 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      log('⚠️  package.json not found', 'yellow');
      return [];
    }
    
    // Run npm outdated
    try {
      const output = execSync('npm outdated --json', { 
        cwd: path.join(process.cwd(), 'app', 'frontend'),
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      const outdated = JSON.parse(output);
      const packages = Object.keys(outdated);
      
      if (packages.length === 0) {
        log('✅ All packages are up to date', 'green');
        return [];
      }
      
      log(`⚠️  Found ${packages.length} outdated package(s):`, 'yellow');
      
      const eolCandidates = [];
      
      packages.forEach(pkg => {
        const info = outdated[pkg];
        const current = info.current;
        const wanted = info.wanted;
        const latest = info.latest;
        
        // Check if package is significantly outdated (potential EOL)
        const currentMajor = parseInt(current.split('.')[0]);
        const latestMajor = parseInt(latest.split('.')[0]);
        
        if (currentMajor < latestMajor - 1) {
          log(`  🔴 ${pkg}: ${current} → ${latest} (Major version behind)`, 'red');
          eolCandidates.push({
            package: pkg,
            current,
            latest,
            severity: 'high',
            reason: 'Multiple major versions behind'
          });
        } else if (current !== wanted) {
          log(`  🟡 ${pkg}: ${current} → ${wanted} (wanted) / ${latest} (latest)`, 'yellow');
        } else {
          log(`  🟢 ${pkg}: ${current} → ${latest}`, 'green');
        }
      });
      
      return eolCandidates;
    } catch (error) {
      // npm outdated returns non-zero exit code when packages are outdated
      // This is expected, so we check if it's just outdated packages
      if (error.status === 1 && error.stdout) {
        try {
          const output = JSON.parse(error.stdout);
          const packages = Object.keys(output);
          
          if (packages.length > 0) {
            log(`⚠️  Found ${packages.length} outdated package(s)`, 'yellow');
            return packages.map(pkg => ({
              package: pkg,
              current: output[pkg].current,
              latest: output[pkg].latest,
              severity: 'medium',
              reason: 'Outdated version'
            }));
          }
        } catch (parseError) {
          // Not JSON output, might be regular text
          log('⚠️  Could not parse npm outdated output', 'yellow');
        }
      }
      
      log(`⚠️  Error checking outdated packages: ${error.message}`, 'yellow');
      return [];
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    return [];
  }
}

function checkPackageMaintenance(packageName) {
  // This is a placeholder - in a real implementation, you would:
  // 1. Check npm registry for last update date
  // 2. Check GitHub repository activity
  // 3. Check for EOL announcements
  // 4. Check security advisories
  
  // For now, we'll just note that manual checking is needed
  return {
    needsManualCheck: true,
    package: packageName,
    note: 'Manual check required for maintenance status'
  };
}

function generateReport(nodeStatus, eolPackages) {
  log('\n📊 EOL Software Report', 'cyan');
  log('='.repeat(50), 'cyan');
  
  const issues = [];
  
  if (nodeStatus.eol) {
    issues.push({
      component: 'Node.js',
      severity: 'critical',
      issue: 'Node.js version is EOL',
      action: 'Upgrade to supported LTS version immediately'
    });
  } else if (nodeStatus.severity === 'high') {
    issues.push({
      component: 'Node.js',
      severity: 'high',
      issue: `Node.js EOL approaching (${nodeStatus.daysUntilEOL} days)`,
      action: 'Plan upgrade to supported LTS version'
    });
  }
  
  eolPackages.forEach(pkg => {
    issues.push({
      component: pkg.package,
      severity: pkg.severity,
      issue: pkg.reason,
      action: `Update to latest version: ${pkg.latest}`
    });
  });
  
  if (issues.length === 0) {
    log('\n✅ No EOL software detected', 'green');
    log('All components appear to be supported', 'green');
  } else {
    log(`\n⚠️  Found ${issues.length} potential EOL issue(s):`, 'yellow');
    
    issues.forEach((issue, index) => {
      const color = issue.severity === 'critical' ? 'red' : 
                   issue.severity === 'high' ? 'yellow' : 'blue';
      log(`\n${index + 1}. ${issue.component}`, color);
      log(`   Severity: ${issue.severity.toUpperCase()}`, color);
      log(`   Issue: ${issue.issue}`, color);
      log(`   Action: ${issue.action}`, color);
    });
    
    log('\n📝 Next Steps:', 'cyan');
    log('1. Review each issue above', 'blue');
    log('2. Create GitHub issues for tracking', 'blue');
    log('3. Plan remediation according to EOL policy', 'blue');
    log('4. Update components within defined SLAs', 'blue');
  }
  
  log('\n' + '='.repeat(50), 'cyan');
  
  return issues;
}

// Main execution
function main() {
  log('🔍 End-of-Life (EOL) Software Detection', 'cyan');
  log('='.repeat(50), 'cyan');
  
  const nodeStatus = checkNodeVersion();
  const eolPackages = checkOutdatedPackages();
  const report = generateReport(nodeStatus, eolPackages);
  
  // Exit with appropriate code
  const hasCritical = report.some(issue => issue.severity === 'critical');
  const hasHigh = report.some(issue => issue.severity === 'high');
  
  if (hasCritical) {
    process.exit(1); // Exit with error for critical issues
  } else if (hasHigh) {
    process.exit(2); // Exit with warning for high severity
  } else {
    process.exit(0); // Success
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  checkNodeVersion,
  checkOutdatedPackages,
  generateReport,
};

