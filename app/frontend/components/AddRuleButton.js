'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from './auth/AuthContext';
import { useCategories } from './CategoriesContext';
import { useRules } from './RulesContext';

export default function AddRuleButton({ transactionName, merchantName, currentCategory, onCategoryChange, transactionId, transactionAmount, onRulesApplied }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [matchingRule, setMatchingRule] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showNewRuleForm, setShowNewRuleForm] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || '');
  const [ruleMatchMode, setRuleMatchMode] = useState('all'); // 'all' or 'byAmount'
  const [matchingTransactions, setMatchingTransactions] = useState([]);
  const [loadingMatching, setLoadingMatching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { token } = useAuth();
  const { categories } = useCategories();
  const { rules, refreshRules } = useRules();
  const buttonRef = useRef(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  const merchant = merchantName || transactionName;

  // Extract a clean pattern from the transaction name
  const extractPattern = (name) => {
    if (!name) return '';
    let pattern = name;
    
    // Remove common prefixes
    const prefixes = [
      'Debit Card Purchase - ',
      'Digital Card Purchase - ',
      'Withdrawal from ',
      'Deposit from ',
      'ATM Withdrawal - ',
      'Check Deposit (',
    ];
    
    for (const prefix of prefixes) {
      if (pattern.startsWith(prefix)) {
        pattern = pattern.substring(prefix.length);
        break;
      }
    }
    
    // Remove location suffixes
    pattern = pattern.replace(/\s+[A-Z]{2,}\s+[A-Z]{2}$/g, '').trim();
    pattern = pattern.replace(/\s+[A-Z]{2}$/g, '').trim();
    
    // Remove trailing codes
    pattern = pattern.replace(/\s*[\*#][A-Z0-9]+$/gi, '').trim();
    
    return pattern.substring(0, 40);
  };

  const suggestedPattern = merchantName || extractPattern(transactionName);

  // Check if transaction matches any existing rule
  const checkMatchingRule = (transactionName, merchantName, rulesList) => {
    if (!rulesList || rulesList.length === 0) return null;
    
    const name = (transactionName || '').toUpperCase();
    const merchant = (merchantName || '').toUpperCase();
    const searchText = `${name} ${merchant}`;

    for (const rule of rulesList) {
      if (!rule.isActive) continue;
      
      const patterns = Array.isArray(rule.patterns) ? rule.patterns : [rule.patterns];
      
      for (const pattern of patterns) {
        const upperPattern = pattern.toUpperCase();
        
        let matches = false;
        switch (rule.matchType) {
          case 'exact':
            matches = name === upperPattern || merchant === upperPattern;
            break;
          case 'startsWith':
            matches = name.startsWith(upperPattern) || merchant.startsWith(upperPattern);
            break;
          case 'contains':
          default:
            matches = searchText.includes(upperPattern);
            break;
        }
        
        if (matches) {
          return rule;
        }
      }
    }
    
    return null;
  };

  // Check for matching rule when rules or transaction changes
  useEffect(() => {
    if (rules.length > 0) {
      const match = checkMatchingRule(transactionName, merchantName, rules);
      setMatchingRule(match);
    } else {
      setMatchingRule(null);
    }
  }, [rules, transactionName, merchantName]);

  // Calculate dropdown position - ensure it stays within viewport
  useEffect(() => {
    if (showDropdown && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = 400; // max-height of dropdown
      const dropdownWidth = 320; // width of dropdown including some padding
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const padding = 10; // padding from viewport edges
      
      // Calculate if dropdown would go off bottom of screen
      const spaceBelow = viewportHeight - rect.bottom - padding;
      const spaceAbove = rect.top - padding;
      
      let top;
      if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
        // Position below the button (default)
        top = rect.bottom + 4;
        // But cap it so it doesn't go off screen
        if (top + dropdownHeight > viewportHeight - padding) {
          top = Math.max(padding, viewportHeight - dropdownHeight - padding);
        }
      } else {
        // Position above the button
        top = Math.max(padding, rect.top - dropdownHeight - 4);
      }
      
      // Calculate horizontal position - ensure it doesn't go off right edge
      let left = rect.left;
      if (left + dropdownWidth > viewportWidth - padding) {
        left = Math.max(padding, viewportWidth - dropdownWidth - padding);
      }
      
      setDropdownPosition({ top, left });
    }
  }, [showDropdown]);

  // Fetch matching transactions when form opens and we have transactionId
  useEffect(() => {
    if (showNewRuleForm && transactionId && merchant) {
      fetchMatchingTransactions();
    } else if (!showNewRuleForm) {
      // Reset when form closes
      setMatchingTransactions([]);
    }
  }, [showNewRuleForm, transactionId, merchant]);

  const fetchMatchingTransactions = async () => {
    if (!transactionId || !merchant) return;
    
    setLoadingMatching(true);
    try {
      const response = await fetch('/api/plaid/transactions/bulk-categorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          transactionId,
          merchantName: merchant,
          action: 'preview',
        }),
      });

      const data = await response.json();
      if (data.success && data.transactions) {
        setMatchingTransactions(data.transactions);
      }
    } catch (err) {
      console.error('Error fetching matching transactions:', err);
    } finally {
      setLoadingMatching(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!showDropdown) return;
    
    const handleClickOutside = (e) => {
      if (!buttonRef.current?.contains(e.target) && !e.target.closest('[data-rule-dropdown]')) {
        setShowDropdown(false);
        setShowNewRuleForm(false);
        setSearchQuery(''); // Reset search when closing
      }
    };
    
    setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  // Reset search when dropdown closes
  useEffect(() => {
    if (!showDropdown) {
      setSearchQuery('');
    }
  }, [showDropdown]);


  const handleAddToExistingRule = async (rule) => {
    setLoading(true);
    try {
      // Add the pattern to the existing rule
      const existingPatterns = Array.isArray(rule.patterns) ? rule.patterns : [rule.patterns];
      const newPatterns = [...new Set([...existingPatterns, suggestedPattern])];
      
      const updateResponse = await fetch(`/api/plaid/rules/${rule.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ patterns: newPatterns }),
      });

      const updateData = await updateResponse.json();
      if (!updateData.success) {
        alert('Failed to update rule: ' + (updateData.error || 'Unknown error'));
        return;
      }

      // Now apply the rule to all matching transactions
      const applyResponse = await fetch('/api/plaid/rules/apply', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const applyData = await applyResponse.json();
      
        if (applyData.success) {
          const message = `✅ Added "${suggestedPattern}" to rule "${rule.name}"\n\n` +
            `Applied category "${rule.category}" to ${applyData.applied} transaction(s)`;
          alert(message);
          
          // Update the current transaction's category if it changed
          if (onCategoryChange && rule.category !== currentCategory) {
            onCategoryChange(rule.category);
          }
          
          // Refresh rules to update matching status
          await refreshRules();
          
          // Notify parent to refresh transactions if callback provided
          if (onRulesApplied && applyData.applied > 0) {
            onRulesApplied();
          }
          
          setShowDropdown(false);
        } else {
          alert('Rule updated but failed to apply: ' + (applyData.error || 'Unknown error'));
        }
      } catch (err) {
        console.error('Error updating rule:', err);
        alert('Failed to update rule');
      } finally {
        setLoading(false);
      }
    };

  const handleCreateNewRule = async (e) => {
    e.preventDefault();
    if (!newRuleName.trim() || !selectedCategory) return;

    setLoading(true);
    try {
      // If byAmount mode, create a rule specifically for this exact amount
      if (ruleMatchMode === 'byAmount' && transactionAmount) {
          const amount = Math.abs(transactionAmount);
          const amountFormatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(amount);
          
          // Create rule name with amount included
          const ruleNameWithAmount = `${newRuleName.trim()} ${amountFormatted}`;
          
          const createResponse = await fetch('/api/plaid/rules/from-transaction', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              transactionName,
              merchantName,
              category: selectedCategory,
              autoApply: true,
              ruleName: ruleNameWithAmount,
              matchAmount: amount, // Pass the specific amount to match (will be converted to matchAmounts array)
            }),
          });

        const createData = await createResponse.json();
        
        if (!createData.success) {
          alert('Failed to create rule: ' + (createData.error || 'Unknown error'));
          return;
        }
        
        // Apply rules
        const applyResponse = await fetch('/api/plaid/rules/apply', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        const applyData = await applyResponse.json();
        
        const message = `✅ Created rule "${ruleNameWithAmount}" for category "${selectedCategory}"\n\n` +
          (applyData.success ? `Applied to ${applyData.applied} transaction(s)` : 'Rule created');
        alert(message);
        
        // Update the current transaction's category
        if (onCategoryChange && selectedCategory !== currentCategory) {
          onCategoryChange(selectedCategory);
        }
        
        // Refresh rules
        await refreshRules();
        
        // Notify parent to refresh transactions if callback provided
        if (onRulesApplied && applyData.applied > 0) {
          onRulesApplied();
        }
        
        setShowDropdown(false);
        setShowNewRuleForm(false);
        setNewRuleName('');
      } else {
        // Create single rule (current behavior)
        const createResponse = await fetch('/api/plaid/rules', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: newRuleName.trim(),
            patterns: [suggestedPattern],
            category: selectedCategory,
            matchType: 'contains',
            autoApply: true,
          }),
        });

        const createData = await createResponse.json();
        if (!createData.success) {
          alert('Failed to create rule: ' + (createData.error || 'Unknown error'));
          return;
        }

        // Apply the new rule to all matching transactions
        const applyResponse = await fetch('/api/plaid/rules/apply', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        const applyData = await applyResponse.json();
        
        if (applyData.success) {
          const message = `✅ Created new rule "${newRuleName}" for category "${selectedCategory}"\n\n` +
            `Applied to ${applyData.applied} transaction(s)`;
          alert(message);
          
          // Update the current transaction's category
          if (onCategoryChange && selectedCategory !== currentCategory) {
            onCategoryChange(selectedCategory);
          }
          
          // Refresh rules
          await refreshRules();
          
          // Notify parent to refresh transactions if callback provided
          if (onRulesApplied && applyData.applied > 0) {
            onRulesApplied();
          }
          
          setShowDropdown(false);
          setShowNewRuleForm(false);
          setNewRuleName('');
        } else {
          alert('Rule created but failed to apply: ' + (applyData.error || 'Unknown error'));
        }
      }
    } catch (err) {
      console.error('Error creating rule:', err);
      alert('Failed to create rule');
    } finally {
      setLoading(false);
    }
  };

  const allCategories = [...new Set([...(categories.predefined || []), ...(categories.custom || [])])];

  // Filter rules based on search query
  const filteredRules = useMemo(() => {
    if (!searchQuery.trim()) return rules;
    
    const query = searchQuery.toLowerCase().trim();
    return rules.filter(rule => {
      // Search in rule name
      if (rule.name?.toLowerCase().includes(query)) return true;
      
      // Search in category
      if (rule.category?.toLowerCase().includes(query)) return true;
      
      // Search in patterns
      const patterns = Array.isArray(rule.patterns) ? rule.patterns : [rule.patterns];
      if (patterns.some(pattern => pattern?.toLowerCase().includes(query))) return true;
      
      return false;
    });
  }, [rules, searchQuery]);

  const dropdownContent = showDropdown && (
    <div
      data-rule-dropdown
      style={{
        position: 'fixed',
        top: `${dropdownPosition.top}px`,
        left: `${dropdownPosition.left}px`,
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        zIndex: 99998,
        width: '300px',
        maxHeight: '400px',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px',
        borderBottom: '1px solid #e5e7eb',
        background: matchingRule ? '#f0fdf4' : '#f9fafb',
      }}>
        <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {matchingRule ? (
            <>
              <span style={{ color: '#10b981' }}>✓</span>
              <span>Matched Rule</span>
            </>
          ) : (
            'Add to Vendor Rule'
          )}
        </div>
        {matchingRule ? (
          <div style={{ fontSize: '12px', color: '#059669', marginTop: '4px' }}>
            <strong>"{matchingRule.name}"</strong> → {matchingRule.category}
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            Pattern: <strong>"{suggestedPattern}"</strong>
          </div>
        )}
      </div>

      {showNewRuleForm ? (
        <form onSubmit={handleCreateNewRule} style={{ padding: '12px' }}>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
              Rule Name
            </label>
            <input
              type="text"
              value={newRuleName}
              onChange={(e) => setNewRuleName(e.target.value)}
              placeholder={suggestedPattern}
              autoFocus
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              <option value="">Select category...</option>
              {allCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          
          {/* Rule Matching Mode Selection - Always show with status */}
          {transactionId && transactionAmount && (
            <div style={{ marginBottom: '10px', padding: '8px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '12px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                Rule Matching Mode:
              </div>
              
              {loadingMatching ? (
                <div style={{ fontSize: '11px', color: '#6b7280', padding: '4px 0' }}>
                  🔍 Searching for similar transactions...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '4px',
                    borderRadius: '4px',
                    background: ruleMatchMode === 'all' ? '#e0e7ff' : 'transparent',
                  }}>
                    <input
                      type="radio"
                      name="ruleMatchMode"
                      value="all"
                      checked={ruleMatchMode === 'all'}
                      onChange={(e) => setRuleMatchMode(e.target.value)}
                      style={{
                        width: '14px',
                        height: '14px',
                        cursor: 'pointer',
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: '500', color: '#111827' }}>Match All "{merchant}" Transactions</div>
                      <div style={{ fontSize: '10px', color: '#6b7280' }}>
                        Any amount from this merchant
                      </div>
                    </div>
                  </label>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '4px',
                    borderRadius: '4px',
                    background: ruleMatchMode === 'byAmount' ? '#e0e7ff' : 'transparent',
                  }}>
                    <input
                      type="radio"
                      name="ruleMatchMode"
                      value="byAmount"
                      checked={ruleMatchMode === 'byAmount'}
                      onChange={(e) => setRuleMatchMode(e.target.value)}
                      style={{
                        width: '14px',
                        height: '14px',
                        cursor: 'pointer',
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: '500', color: '#111827' }}>
                        Match Only {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(transactionAmount))} Transactions
                      </div>
                      <div style={{ fontSize: '10px', color: '#6b7280' }}>
                        Only "{merchant}" at this exact amount (like a subscription)
                      </div>
                    </div>
                  </label>
                </div>
              )}
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="submit"
              disabled={loading || !newRuleName.trim() || !selectedCategory}
              style={{
                flex: 1,
                padding: '8px',
                background: loading ? '#9ca3af' : '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Creating...' : 'Create Rule'}
            </button>
            <button
              type="button"
              onClick={() => setShowNewRuleForm(false)}
              style={{
                padding: '8px 12px',
                background: '#e5e7eb',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Back
            </button>
          </div>
        </form>
      ) : (
        <>
          {/* Show matching rule first */}
          {matchingRule && (
            <>
              <div style={{
                padding: '10px 12px',
                background: '#f0fdf4',
                borderBottom: '1px solid #d1fae5',
                fontSize: '12px',
                color: '#059669',
              }}>
                <div style={{ fontWeight: '500', marginBottom: '2px' }}>
                  ✓ Currently matched
                </div>
                <div style={{ fontSize: '11px' }}>
                  This transaction matches rule "{matchingRule.name}" and will be categorized as "{matchingRule.category}"
                </div>
              </div>
            </>
          )}

          {/* Create New Rule Option */}
          <button
            onClick={() => {
              setNewRuleName(suggestedPattern);
              setSelectedCategory(currentCategory || '');
              setShowNewRuleForm(true);
            }}
            style={{
              width: '100%',
              padding: '10px 12px',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #e5e7eb',
              cursor: 'pointer',
              fontSize: '13px',
              color: '#667eea',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onMouseEnter={(e) => e.target.style.background = '#f9fafb'}
            onMouseLeave={(e) => e.target.style.background = 'transparent'}
          >
            <span style={{ fontSize: '16px' }}>+</span>
            Create New Rule
          </button>

          {/* Existing Rules */}
          {rules.length > 0 && (
            <>
              <div style={{
                padding: '8px 12px',
                fontSize: '11px',
                color: '#6b7280',
                fontWeight: '600',
                background: '#f9fafb',
              }}>
                Add to Existing Rule
              </div>
              
              {/* Search Input */}
              <div style={{
                padding: '8px 12px',
                borderBottom: '1px solid #e5e7eb',
                background: '#f9fafb',
              }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="🔍 Search rules by name, category, or pattern..."
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '12px',
                    background: 'white',
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              
              {/* Filtered Rules List */}
              {filteredRules.length > 0 ? (
                filteredRules.map(rule => {
                const isMatching = matchingRule?.id === rule.id;
                return (
                  <button
                    key={rule.id}
                    onClick={() => handleAddToExistingRule(rule)}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      textAlign: 'left',
                      background: isMatching ? '#f0fdf4' : 'transparent',
                      border: 'none',
                      borderBottom: '1px solid #f3f4f6',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                    onMouseEnter={(e) => !isMatching && (e.target.style.background = '#f9fafb')}
                    onMouseLeave={(e) => !isMatching && (e.target.style.background = 'transparent')}
                  >
                    <div>
                      <div style={{ fontWeight: '500', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isMatching && <span style={{ color: '#10b981' }}>✓</span>}
                        {rule.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>
                        → {rule.category}
                      </div>
                    </div>
                  </button>
                );
              })
              ) : (
                <div style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: '#6b7280',
                  fontSize: '12px',
                  fontStyle: 'italic',
                }}>
                  No rules match "{searchQuery}"
                </div>
              )}
            </>
          )}

          {rules.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
              No existing rules yet. Create one!
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setShowDropdown(!showDropdown)}
        title={matchingRule ? `Matched: ${matchingRule.name}` : "Add to vendor rule"}
        style={{
          padding: '4px 8px',
          background: matchingRule 
            ? '#10b981' 
            : showDropdown 
              ? '#667eea' 
              : '#f3f4f6',
          color: matchingRule || showDropdown ? 'white' : '#6b7280',
          border: matchingRule ? '1px solid #059669' : '1px solid #d1d5db',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {matchingRule ? '✓' : '⚙️'}
      </button>
      {typeof window !== 'undefined' && dropdownContent && createPortal(dropdownContent, document.body)}
    </>
  );
}
