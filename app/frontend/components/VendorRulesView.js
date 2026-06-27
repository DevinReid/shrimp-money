'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './auth/AuthContext';
import { useCategories } from './CategoriesContext';
import { useRules } from './RulesContext';

export default function VendorRulesView() {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [expandedRuleId, setExpandedRuleId] = useState(null);
  const [matchingTransactions, setMatchingTransactions] = useState({});
  const [loadingTransactions, setLoadingTransactions] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const { token } = useAuth();
  const { categories } = useCategories();
  const { rules, refreshRules } = useRules();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    patterns: '',
    category: '',
    matchType: 'contains',
    matchAmounts: [], // Array of amounts
    autoApply: true,
    priority: 0,
  });


  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);

      const patternsArray = formData.patterns
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      if (patternsArray.length === 0) {
        setError('At least one pattern is required');
        return;
      }

      const url = editingRule 
        ? `/api/plaid/rules/${editingRule.id}`
        : '/api/plaid/rules';
      
      const method = editingRule ? 'PUT' : 'POST';

      // Prepare data for submission
      const submitData = {
        ...formData,
        patterns: patternsArray,
        // Convert matchAmounts array to numbers, filter out empty values
        matchAmounts: formData.matchAmounts
          .map(amt => amt ? parseFloat(amt) : null)
          .filter(amt => amt !== null && !isNaN(amt)),
      };
      
      // If no amounts, set to null
      if (submitData.matchAmounts.length === 0) {
        submitData.matchAmounts = null;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      });

      const data = await response.json();

      if (data.success) {
        await refreshRules();
        resetForm();
      } else {
        setError(data.error || 'Failed to save rule');
      }
    } catch (err) {
      console.error('Error saving rule:', err);
      setError('Failed to save rule');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (ruleId) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/plaid/rules/${ruleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const data = await response.json();

      if (data.success) {
        await refreshRules();
      } else {
        setError(data.error || 'Failed to delete rule');
      }
    } catch (err) {
      console.error('Error deleting rule:', err);
      setError('Failed to delete rule');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    // Support both old matchAmount (single) and new matchAmounts (array)
    const amounts = rule.matchAmounts 
      ? (Array.isArray(rule.matchAmounts) ? rule.matchAmounts : [rule.matchAmounts])
      : (rule.matchAmount ? [rule.matchAmount] : []);
    
    setFormData({
      name: rule.name,
      patterns: Array.isArray(rule.patterns) ? rule.patterns.join('\n') : rule.patterns,
      category: rule.category,
      matchType: rule.matchType,
      matchAmounts: amounts,
      autoApply: rule.autoApply,
      priority: rule.priority,
    });
    setShowAddForm(true);
  };

  const handleApplyRules = async () => {
    try {
      setApplying(true);
      setError(null);
      
      const response = await fetch('/api/plaid/rules/apply', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ Rules Applied!\n\nAuto-categorized: ${data.applied} transactions\nSuggested for review: ${data.suggested} transactions`);
      } else {
        setError(data.error || 'Failed to apply rules');
      }
    } catch (err) {
      console.error('Error applying rules:', err);
      setError('Failed to apply rules');
    } finally {
      setApplying(false);
    }
  };

  const handleToggleTransactions = async (ruleId) => {
    if (expandedRuleId === ruleId) {
      // Collapse
      setExpandedRuleId(null);
      return;
    }

    // Expand - fetch transactions if not already loaded
    setExpandedRuleId(ruleId);
    
    if (matchingTransactions[ruleId]) {
      // Already loaded
      return;
    }

    try {
      setLoadingTransactions(prev => ({ ...prev, [ruleId]: true }));
      
      const response = await fetch(`/api/plaid/rules/${ruleId}/transactions`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const data = await response.json();

      if (data.success) {
        setMatchingTransactions(prev => ({ ...prev, [ruleId]: data.transactions || [] }));
      } else {
        setError(data.error || 'Failed to load matching transactions');
      }
    } catch (err) {
      console.error('Error fetching matching transactions:', err);
      setError('Failed to load matching transactions');
    } finally {
      setLoadingTransactions(prev => ({ ...prev, [ruleId]: false }));
    }
  };

  const handleRemoveFromRule = async (ruleId, transactionId) => {
    if (!confirm('Remove this transaction from the rule? It will no longer match this rule, and its category will be removed.')) return;

    try {
      // Get the current rule to see existing exclusions
      const rule = rules.find(r => r.id === ruleId);
      if (!rule) {
        setError('Rule not found');
        return;
      }

      // Get current exclusions
      const currentExclusions = Array.isArray(rule.excludedTransactions) 
        ? rule.excludedTransactions 
        : (rule.excludedTransactions ? [rule.excludedTransactions] : []);
      
      // Add this transaction to exclusions
      const newExclusions = [...new Set([...currentExclusions, transactionId])];

      // Update the rule with new exclusions
      const updateResponse = await fetch(`/api/plaid/rules/${ruleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          excludedTransactions: newExclusions,
        }),
      });

      const updateData = await updateResponse.json();

      if (!updateData.success) {
        setError(updateData.error || 'Failed to update rule');
        return;
      }

      // Also remove the category from the transaction
      const categoryResponse = await fetch(`/api/plaid/transactions/${transactionId}/category`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const categoryData = await categoryResponse.json();

      // Remove the transaction from the local list (it no longer matches)
      setMatchingTransactions(prev => ({
        ...prev,
        [ruleId]: prev[ruleId].filter(t => t.transaction_id !== transactionId),
      }));

      // Refresh rules to get updated exclusion list
      await refreshRules();

      if (!categoryData.success) {
        console.warn('Rule updated but failed to remove category:', categoryData.error);
      }
    } catch (err) {
      console.error('Error removing transaction from rule:', err);
      setError('Failed to remove transaction from rule');
    }
  };

  const handleUpdateCategory = async (ruleId, transactionId, newCategory) => {
    try {
      // If empty/uncategorized, remove category but keep in rule
      if (!newCategory || newCategory.trim() === '') {
        const response = await fetch(`/api/plaid/transactions/${transactionId}/category`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });

        const data = await response.json();

        if (data.success) {
          // Update the transaction in the local state
          setMatchingTransactions(prev => ({
            ...prev,
            [ruleId]: prev[ruleId].map(t => 
              t.transaction_id === transactionId 
                ? { ...t, userCategory: null }
                : t
            ),
          }));
        } else {
          setError(data.error || 'Failed to remove category');
        }
        return;
      }

      const response = await fetch(`/api/plaid/transactions/${transactionId}/category`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ category: newCategory }),
      });

      const data = await response.json();

      if (data.success) {
        // Update the transaction in the local state
        setMatchingTransactions(prev => ({
          ...prev,
          [ruleId]: prev[ruleId].map(t => 
            t.transaction_id === transactionId 
              ? { ...t, userCategory: newCategory }
              : t
          ),
        }));
      } else {
        setError(data.error || 'Failed to update category');
      }
    } catch (err) {
      console.error('Error updating category:', err);
      setError('Failed to update category');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      patterns: '',
      category: '',
      matchType: 'contains',
      matchAmounts: [],
      autoApply: true,
      priority: 0,
    });
    setEditingRule(null);
    setShowAddForm(false);
  };

  const handleAddAmount = () => {
    setFormData({
      ...formData,
      matchAmounts: [...formData.matchAmounts, ''],
    });
  };

  const handleRemoveAmount = (index) => {
    setFormData({
      ...formData,
      matchAmounts: formData.matchAmounts.filter((_, i) => i !== index),
    });
  };

  const handleUpdateAmount = (index, value) => {
    const newAmounts = [...formData.matchAmounts];
    newAmounts[index] = value;
    setFormData({
      ...formData,
      matchAmounts: newAmounts,
    });
  };

  const allCategories = [...(categories.predefined || []), ...(categories.custom || [])];

  // Filter rules based on search query
  const filteredRules = rules.filter(rule => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    
    // Search in rule name
    if (rule.name?.toLowerCase().includes(query)) return true;
    
    // Search in patterns
    const patterns = Array.isArray(rule.patterns) ? rule.patterns : [rule.patterns];
    if (patterns.some(p => p?.toLowerCase().includes(query))) return true;
    
    // Search in category
    if (rule.category?.toLowerCase().includes(query)) return true;
    
    return false;
  });

  return (
    <div className="vendor-rules-container" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div className="vendor-rules-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '600' }}>
          Vendor Categorization Rules
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleApplyRules}
            disabled={applying || rules.length === 0}
            style={{
              padding: '10px 20px',
              background: applying ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: applying || rules.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            {applying ? '⏳ Applying...' : '🚀 Apply Rules to Transactions'}
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              padding: '10px 20px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            {showAddForm ? '✕ Cancel' : '+ Add Rule'}
          </button>
        </div>
      </div>

      <p style={{ color: '#6b7280', marginBottom: '20px', fontSize: '14px' }}>
        Create rules to automatically categorize transactions based on vendor name patterns.
        When you categorize a transaction, you can quickly create a rule from it!
      </p>

      {/* Search Bar */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search rules by name, pattern, or category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '2px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => e.target.style.borderColor = '#FF69B4'}
          onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{
              marginTop: '8px',
              padding: '6px 12px',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#6b7280',
            }}
          >
            Clear search
          </button>
        )}
        {searchQuery && (
          <div style={{ marginTop: '8px', fontSize: '14px', color: '#6b7280' }}>
            Showing {filteredRules.length} of {rules.length} rule{filteredRules.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {error && (
        <div style={{
          padding: '12px',
          background: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          color: '#991b1b',
          marginBottom: '20px',
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div style={{
          padding: '20px',
          background: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          marginBottom: '20px',
        }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '16px' }}>
            {editingRule ? 'Edit Rule' : 'Add New Rule'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="vendor-rules-form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  Rule Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Apple Card Payment"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                >
                  <option value="">Select category...</option>
                  {allCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                Patterns to Match (one per line)
              </label>
              <textarea
                value={formData.patterns}
                onChange={(e) => setFormData({ ...formData, patterns: e.target.value })}
                placeholder="Apple Card&#10;APPLE CARD GSBANK&#10;Apple Pay"
                required
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                }}
              />
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                Add multiple patterns to catch variations (e.g., "The Bell", "TACO BELL", "Taco Bell #123")
              </p>
            </div>

            <div style={{ marginBottom: '15px', padding: '12px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                Match Specific Amounts (Optional)
              </label>
              <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>
                Leave empty to match any amount, or add specific amounts to match (e.g., $9.99, $14.89 for different subscription tiers)
              </p>
              {formData.matchAmounts.map((amount, index) => (
                <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#6b7280', minWidth: '20px' }}>$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => handleUpdateAmount(index, e.target.value)}
                    placeholder="0.00"
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveAmount(index)}
                    style={{
                      padding: '6px 10px',
                      background: '#fee2e2',
                      color: '#991b1b',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddAmount}
                style={{
                  padding: '8px 12px',
                  background: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                }}
              >
                + Add Amount
              </button>
            </div>

            <div className="vendor-rules-form-row-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  Match Type
                </label>
                <select
                  value={formData.matchType}
                  onChange={(e) => setFormData({ ...formData, matchType: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                >
                  <option value="contains">Contains</option>
                  <option value="startsWith">Starts With</option>
                  <option value="exact">Exact Match</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  Priority
                </label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
                <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>
                  Higher = checked first
                </p>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  Auto-Apply
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.autoApply}
                    onChange={(e) => setFormData({ ...formData, autoApply: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontSize: '14px' }}>
                    {formData.autoApply ? 'Yes - apply automatically' : 'No - suggest only'}
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '10px 20px',
                  background: loading ? '#9ca3af' : '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                }}
              >
                {loading ? 'Saving...' : (editingRule ? 'Update Rule' : 'Create Rule')}
              </button>
              <button
                type="button"
                onClick={resetForm}
                style={{
                  padding: '10px 20px',
                  background: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rules List */}
      {loading && rules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
          Loading rules...
        </div>
      ) : filteredRules.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          background: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ color: '#6b7280', fontSize: '18px', marginBottom: '10px' }}>
            {searchQuery ? 'No rules match your search' : 'No rules defined yet'}
          </p>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            {searchQuery 
              ? 'Try a different search term or clear your search to see all rules.'
              : 'Create rules to automatically categorize transactions based on vendor names.'
            }
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                marginTop: '15px',
                padding: '8px 16px',
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div style={{
          background: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}>
          <div className="vendor-rules-table-header" style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr auto',
            gap: '15px',
            padding: '15px',
            background: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            fontWeight: '600',
            fontSize: '14px',
            color: '#6b7280',
          }}>
            <div>Name / Patterns</div>
            <div>Category</div>
            <div>Match Type</div>
            <div>Amount</div>
            <div>Auto-Apply</div>
            <div>Actions</div>
          </div>
          
          {filteredRules.map((rule, index) => {
            const isExpanded = expandedRuleId === rule.id;
            const transactions = matchingTransactions[rule.id] || [];
            const isLoading = loadingTransactions[rule.id];
            
            return (
              <div key={rule.id}>
                <div
                  className="vendor-rules-table-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr auto',
                    gap: '15px',
                    padding: '15px',
                    borderBottom: index < filteredRules.length - 1 ? '1px solid #e5e7eb' : 'none',
                    background: rule.isActive ? 'white' : '#f9fafb',
                    opacity: rule.isActive ? 1 : 0.6,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '500', marginBottom: '4px' }}>{rule.name}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {Array.isArray(rule.patterns) 
                        ? rule.patterns.slice(0, 3).join(', ') + (rule.patterns.length > 3 ? ` +${rule.patterns.length - 3} more` : '')
                        : rule.patterns
                      }
                    </div>
                  </div>
                  <div>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      background: '#f3f4f6',
                      borderRadius: '4px',
                      fontSize: '13px',
                    }}>
                      {rule.category}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#6b7280' }}>
                    {rule.matchType}
                  </div>
                  <div>
                    {(() => {
                      // Support both old matchAmount and new matchAmounts
                      const amounts = rule.matchAmounts 
                        ? (Array.isArray(rule.matchAmounts) ? rule.matchAmounts : [rule.matchAmounts])
                        : (rule.matchAmount ? [rule.matchAmount] : []);
                      
                      if (amounts.length === 0) {
                        return <span style={{ fontSize: '12px', color: '#9ca3af' }}>Any</span>;
                      }
                      
                      if (amounts.length === 1) {
                        return (
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            background: '#dbeafe',
                            color: '#1e40af',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '500',
                          }}>
                            ${parseFloat(amounts[0]).toFixed(2)}
                          </span>
                        );
                      }
                      
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {amounts.slice(0, 2).map((amt, idx) => (
                            <span key={idx} style={{
                              display: 'inline-block',
                              padding: '4px 8px',
                              background: '#dbeafe',
                              color: '#1e40af',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '500',
                            }}>
                              ${parseFloat(amt).toFixed(2)}
                            </span>
                          ))}
                          {amounts.length > 2 && (
                            <span style={{ fontSize: '11px', color: '#6b7280' }}>
                              +{amounts.length - 2}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      background: rule.autoApply ? '#d1fae5' : '#fef3c7',
                      color: rule.autoApply ? '#065f46' : '#92400e',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}>
                      {rule.autoApply ? '✓ Auto' : '? Suggest'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleToggleTransactions(rule.id)}
                      style={{
                        padding: '6px 12px',
                        background: isExpanded ? '#667eea' : '#e5e7eb',
                        color: isExpanded ? 'white' : '#374151',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {isLoading ? '...' : isExpanded ? '▼ Hide' : '▶ View'}
                    </button>
                    <button
                      onClick={() => handleEdit(rule)}
                      style={{
                        padding: '6px 12px',
                        background: '#e5e7eb',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      style={{
                        padding: '6px 12px',
                        background: '#fee2e2',
                        color: '#991b1b',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                
                {/* Expanded Transactions List */}
                {isExpanded && (
                  <div style={{
                    padding: '15px',
                    background: '#f9fafb',
                    borderBottom: index < filteredRules.length - 1 ? '1px solid #e5e7eb' : 'none',
                  }}>
                    {isLoading ? (
                      <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                        Loading matching transactions...
                      </div>
                    ) : transactions.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                        No transactions match this rule yet.
                      </div>
                    ) : (
                      <>
                        <div style={{ 
                          marginBottom: '10px', 
                          fontSize: '14px', 
                          fontWeight: '500',
                          color: '#374151',
                        }}>
                          {transactions.length} matching transaction{transactions.length !== 1 ? 's' : ''}:
                        </div>
                        <div style={{
                          maxHeight: '400px',
                          overflowY: 'auto',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          background: 'white',
                        }}>
                          {transactions.map((transaction) => (
                            <div
                              key={transaction.transaction_id}
                              style={{
                                padding: '12px',
                                borderBottom: '1px solid #f3f4f6',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '15px',
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                                  {transaction.name || transaction.merchant_name}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                  {new Date(transaction.date).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </div>
                              </div>
                              <div style={{ marginRight: '15px', textAlign: 'right', minWidth: '100px' }}>
                                <div style={{ fontWeight: '500', fontSize: '14px' }}>
                                  {new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: 'USD',
                                  }).format(Math.abs(transaction.amount))}
                                </div>
                                <div style={{ fontSize: '12px', color: transaction.userCategory ? '#10b981' : '#ef4444' }}>
                                  {transaction.userCategory || 'Uncategorized'}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: '200px' }}>
                                <select
                                  value={transaction.userCategory || ''}
                                  onChange={(e) => handleUpdateCategory(expandedRuleId, transaction.transaction_id, e.target.value)}
                                  style={{
                                    padding: '6px 8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    minWidth: '120px',
                                  }}
                                >
                                  <option value="">Uncategorized</option>
                                  {allCategories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleRemoveFromRule(expandedRuleId, transaction.transaction_id)}
                                  style={{
                                    padding: '6px 10px',
                                    background: '#fee2e2',
                                    color: '#991b1b',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title="Remove from rule (exclude from matching)"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

