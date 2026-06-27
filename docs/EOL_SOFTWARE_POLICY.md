# End-of-Life (EOL) Software Management Policy

## Overview

This document defines the policy and procedures for monitoring, identifying, and managing End-of-Life (EOL) software in Plaid Connect. EOL software no longer receives security updates or patches, making it vulnerable to security risks.

**Last Updated:** November 20, 2025  
**Review Schedule:** Quarterly or when EOL software is identified

---

## 1. Policy Statement

Plaid Connect is committed to maintaining secure and supported software components. All EOL software must be identified, assessed, and either updated to supported versions or replaced with supported alternatives within defined timeframes.

---

## 2. Objectives

- **Identify EOL software** through regular monitoring
- **Assess risk** of using EOL software
- **Plan migration** to supported alternatives
- **Execute updates/replacements** in a timely manner
- **Document decisions** and maintain inventory
- **Prevent new EOL software** from being introduced

---

## 3. Definitions

### 3.1 End-of-Life (EOL)

Software is considered End-of-Life when:
- The vendor/community has announced end of support
- No security patches or updates are provided
- No bug fixes or maintenance updates are available
- The software version is no longer maintained

### 3.2 End-of-Support (EOS)

Software is End-of-Support when:
- Security updates may still be provided for critical issues
- General maintenance has ended
- Migration to newer versions is recommended

### 3.3 End-of-Sale (EOS)

Software is End-of-Sale when:
- No longer available for purchase
- Existing installations may still be supported
- Migration planning should begin

---

## 4. EOL Software Classification

### 4.1 Severity Levels

| Level | Description | Action Required | Timeline |
|-------|-------------|-----------------|----------|
| **Critical** | EOL with known vulnerabilities | Immediate replacement | 30 days |
| **High** | EOL, no security updates | Plan replacement | 90 days |
| **Medium** | EOS, limited support | Plan migration | 180 days |
| **Low** | EOS, still receiving critical patches | Monitor and plan | 365 days |

---

## 5. Monitoring Process

### 5.1 Regular Monitoring

**Frequency:**
- **Monthly**: Check all dependencies for EOL status
- **Quarterly**: Comprehensive EOL audit
- **On Dependency Updates**: Check EOL status before adding new dependencies
- **Continuous**: Monitor vendor announcements and security advisories

### 5.2 Monitoring Sources

1. **Vendor Announcements**
   - Official EOL notices
   - Support lifecycle pages
   - Security advisories

2. **Community Resources**
   - Node.js LTS schedule
   - npm package maintenance status
   - GitHub repository activity

3. **Automated Tools**
   - npm outdated
   - Dependency scanning tools
   - EOL monitoring services

4. **Security Advisories**
   - CVE database
   - GitHub Security Advisories
   - npm Security Advisories

### 5.3 Monitoring Checklist

- [ ] Check Node.js version and LTS status
- [ ] Review all npm dependencies for EOL status
- [ ] Check framework versions (Next.js, React, etc.)
- [ ] Review system dependencies
- [ ] Monitor vendor EOL announcements
- [ ] Check for security advisories
- [ ] Review GitHub repository activity
- [ ] Document findings

---

## 6. Identification and Assessment

### 6.1 Identification Process

1. **Automated Scanning**
   ```bash
   npm outdated
   npm audit
   ```

2. **Manual Review**
   - Check vendor lifecycle pages
   - Review dependency documentation
   - Monitor security advisories

3. **EOL Detection**
   - Identify EOL/EOS announcements
   - Check last update date
   - Review maintenance status

### 6.2 Assessment Criteria

**Risk Assessment Factors:**
- **Security Impact**: Are there known vulnerabilities?
- **Business Impact**: How critical is this component?
- **Replacement Complexity**: How difficult is migration?
- **Support Availability**: Is alternative support available?
- **Compliance Requirements**: Does EOL affect compliance?

### 6.3 Assessment Steps

1. **Identify EOL Software**
   - Component name and version
   - EOL announcement date
   - Last supported version
   - EOL date

2. **Assess Risk**
   - Security vulnerabilities
   - Business impact
   - Compliance implications

3. **Classify Severity**
   - Critical/High/Medium/Low
   - Based on risk assessment

4. **Document Findings**
   - Create tracking issue
   - Set remediation deadline
   - Plan migration strategy

---

## 7. Remediation Process

### 7.1 Remediation Options

1. **Upgrade to Supported Version**
   - Update to latest supported version
   - Test compatibility
   - Deploy update

2. **Replace with Alternative**
   - Identify alternative solution
   - Plan migration
   - Execute replacement

3. **Accept Risk** (Temporary)
   - Document business justification
   - Implement compensating controls
   - Set timeline for remediation

### 7.2 Remediation Timeline

| Severity | Timeline | Action |
|----------|----------|--------|
| **Critical** | 30 days | Immediate replacement required |
| **High** | 90 days | Plan and execute replacement |
| **Medium** | 180 days | Plan migration to supported version |
| **Low** | 365 days | Monitor and plan for future update |

### 7.3 Remediation Steps

1. **Plan Migration**
   - Identify target version/alternative
   - Assess compatibility
   - Plan testing strategy
   - Set timeline

2. **Test in Development**
   - Update/Replace in dev environment
   - Test all functionality
   - Verify security fixes
   - Document issues

3. **Deploy to Production**
   - Deploy update/replacement
   - Monitor for issues
   - Verify functionality
   - Update documentation

4. **Verify Resolution**
   - Confirm EOL software removed
   - Verify replacement working
   - Update inventory
   - Close tracking issue

---

## 8. Prevention

### 8.1 Pre-Installation Checks

**Before Adding New Dependencies:**

1. **Check Maintenance Status**
   - Last update date
   - GitHub activity
   - npm download trends

2. **Verify Support**
   - Active maintenance
   - Security updates
   - Community support

3. **Check EOL Status**
   - No EOL announcements
   - Supported version
   - Long-term support available

### 8.2 Dependency Management

**Best Practices:**
- Use LTS versions when available
- Prefer actively maintained packages
- Avoid deprecated packages
- Monitor dependency health
- Regular dependency updates

### 8.3 Approval Process

**For EOL Software:**
- Business justification required
- Risk assessment mandatory
- Compensating controls needed
- Timeline for replacement required
- Management approval for exceptions

---

## 9. Inventory and Tracking

### 9.1 EOL Software Inventory

**Track the following:**
- Component name and version
- EOL announcement date
- EOL date
- Severity classification
- Risk assessment
- Remediation plan
- Target replacement/version
- Status (Identified/In Progress/Resolved)
- Owner/Responsible party

### 9.2 Tracking System

**Current Implementation:**
- GitHub Issues for EOL tracking
- Labels: `eol`, `end-of-life`, `critical`, `high`, `medium`, `low`
- Milestones for remediation deadlines

**Tracking Template:**
```markdown
## EOL Software: [Component Name] v[Version]

**EOL Date**: [Date]  
**Severity**: [Critical/High/Medium/Low]  
**Remediation Deadline**: [Date]  
**Status**: [Identified/In Progress/Resolved]

### Details
- **Component**: [Name]
- **Current Version**: [Version]
- **EOL Announcement**: [Date]
- **Last Supported Version**: [Version]
- **Risk Assessment**: [Details]

### Remediation Plan
- **Target**: [Replacement/Upgrade Version]
- **Timeline**: [Plan]
- **Dependencies**: [List]
- **Testing**: [Plan]

### Status
- [ ] Assessment complete
- [ ] Remediation planned
- [ ] Testing in progress
- [ ] Deployed to production
- [ ] Verified resolution
```

---

## 10. Key Software Components

### 10.1 Current Stack

**Runtime:**
- **Node.js**: Check LTS schedule
- **Next.js**: Monitor version support
- **React**: Monitor version lifecycle

**Dependencies:**
- Regular npm audit
- Monitor package maintenance
- Check for EOL announcements

### 10.2 Monitoring Schedule

| Component | Check Frequency | Source |
|-----------|----------------|--------|
| Node.js | Monthly | nodejs.org/en/about/releases |
| Next.js | Monthly | nextjs.org/docs |
| React | Monthly | react.dev |
| npm packages | Monthly | npmjs.com |
| All dependencies | Quarterly | Comprehensive audit |

---

## 11. Tools and Resources

### 11.1 Monitoring Tools

**Command Line:**
```bash
# Check for outdated packages
npm outdated

# Check Node.js version
node --version

# Check npm version
npm --version
```

**Online Resources:**
- Node.js Release Schedule: https://nodejs.org/en/about/releases
- npm Package Pages: https://www.npmjs.com/
- GitHub Repository Pages
- Vendor Lifecycle Pages

### 11.2 EOL Tracking

**Resources:**
- **Node.js LTS**: https://nodejs.org/en/about/releases
- **npm Security Advisories**: https://www.npmjs.com/advisories
- **GitHub Security Advisories**: https://github.com/advisories
- **CVE Database**: https://cve.mitre.org/

---

## 12. Responsibilities

### 12.1 System Owner

- Maintain EOL software policy
- Approve exceptions
- Review and update policy
- Ensure compliance

### 12.2 Development Team

- Monitor for EOL software
- Assess and classify EOL components
- Plan and execute remediation
- Document decisions

### 12.3 Security Team (Future)

- Conduct EOL assessments
- Review security implications
- Provide guidance on alternatives
- Monitor compliance

---

## 13. Compliance and Reporting

### 13.1 Compliance Requirements

This policy ensures compliance with:
- **Plaid Security Requirements**: EOL software monitoring and management
- **Industry Standards**: NIST, OWASP, ISO 27001
- **Regulatory Requirements**: Security best practices

### 13.2 Reporting

**Reporting Frequency:**
- **Monthly**: EOL software status report
- **Quarterly**: Comprehensive EOL audit
- **As Needed**: Critical EOL discoveries

**Metrics Tracked:**
- Number of EOL components identified
- EOL components by severity
- Remediation status
- Time to remediation
- Compliance rate

---

## 14. Policy Review and Updates

### 14.1 Review Schedule

- **Quarterly**: Review policy effectiveness
- **Annually**: Comprehensive policy review
- **As Needed**: Update when requirements change

### 14.2 Update Procedure

1. Identify need for policy update
2. Review current policy
3. Document proposed changes
4. Review security implications
5. Update policy document
6. Communicate changes
7. Implement updates

---

## 15. EOL Management Checklist

### For Each EOL Component:

- [ ] Identify EOL status
- [ ] Assess risk and severity
- [ ] Classify (Critical/High/Medium/Low)
- [ ] Set remediation deadline
- [ ] Create tracking issue
- [ ] Plan remediation strategy
- [ ] Test replacement/upgrade
- [ ] Deploy remediation
- [ ] Verify resolution
- [ ] Update inventory
- [ ] Close tracking issue

---

## Appendix A: Current Software Inventory

### Runtime Environment

| Component | Version | Status | EOL Date | Next Review |
|-----------|---------|--------|----------|-------------|
| Node.js | 18.x | LTS | April 2025 | Monthly |
| Next.js | 16.0.3 | Current | TBD | Monthly |
| React | 19.2.0 | Current | TBD | Monthly |

### Key Dependencies

| Package | Version | Status | Last Check | Next Review |
|---------|---------|--------|------------|-------------|
| plaid | 21.0.0 | Current | Nov 2025 | Monthly |
| jsonwebtoken | 9.0.2 | Current | Nov 2025 | Monthly |
| bcryptjs | 3.0.3 | Current | Nov 2025 | Monthly |

*Note: This inventory should be updated monthly*

---

## Appendix B: EOL Detection Script

See `scripts/check-eol.js` for automated EOL detection script.

---

## Appendix C: Example EOL Response

### Critical EOL Example

**Component**: Express.js 4.16.x  
**EOL Date**: January 2024  
**Severity**: Critical  
**Discovery**: November 20, 2025  
**Remediation Deadline**: December 20, 2025 (30 days)

**Response**:
1. **Assessment**: Critical - no security updates available
2. **Plan**: Upgrade to Express.js 5.x
3. **Testing**: Tested in development - compatible
4. **Deployment**: Upgraded to Express.js 5.1.0
5. **Verification**: All endpoints working, no issues
6. **Status**: ✅ Resolved (15 days < 30-day deadline)

---

**Policy Owner**: Devin Reid  
**Effective Date**: November 20, 2025  
**Next Review Date**: February 20, 2026

