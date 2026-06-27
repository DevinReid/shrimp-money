# Recurring Payments & Bills Analysis Summary

**Analysis Date:** November 28, 2025  
**Source:** 360 Checking Account CSV Export  
**Total Transactions Analyzed:** 1,308

---

## 📋 DEFINITE MONTHLY BILLS & SUBSCRIPTIONS

These are confirmed recurring monthly bills based on keywords (AUTO PAY, BILL, SUBSCRIPTION) and consistent patterns:

### Major Bills
| Bill Name | Monthly Cost | Frequency | Last Payment | Notes |
|-----------|-------------|-----------|--------------|-------|
| **Mortgage (PennyMac)** | $3,094.74 | Monthly | 11/03/25 | Very consistent |
| **Apple Card Payment** | $516.94 | Monthly | 10/23/25 | Credit card auto-pay |
| **Discover Card Payment** | $289.00 | Monthly | 11/19/25 | Credit card auto-pay |
| **Wells Fargo Credit Card** | $119.00 | Monthly | 11/28/25 | Credit card auto-pay |
| **Citi Card Payment** | $73.00 | Bi-weekly (~$158/mo) | 11/28/25 | Variable amounts |

### Utilities
| Service | Monthly Cost | Frequency | Last Payment |
|---------|-------------|-----------|--------------|
| **SWBNO (Water/Sewer)** | ~$61-77 | Monthly | 11/19/25 | Variable |
| **Entergy (Electric)** | ~$153 | Monthly | Multiple entries | Bank draft |
| **Delta States Utilities** | ~$14 | Monthly | 10/09/25 | |

### Internet & Phone
| Service | Monthly Cost | Frequency | Last Payment |
|---------|-------------|-----------|--------------|
| **Cox Communications** | $109.99 | Monthly | 11/26/25 | Internet/cable |
| **Cricket Wireless** | $90.00 | Monthly | 09/24/25 | Phone service |

### Subscriptions & Services
| Service | Monthly Cost | Frequency | Last Payment | Notes |
|---------|-------------|-----------|--------------|-------|
| **Netflix** | $19.79 | Monthly | 11/17/25 | |
| **Hulu** | $20.89 | Monthly | 11/19/25 | |
| **Spotify** | $18.69 | Monthly | 07/28/25 | May be paused |
| **OpenAI ChatGPT** | $22.00 | Monthly | 08/01/25 | May be paused |
| **Microsoft 365** | $9.99 | Monthly | 11/06/25 | |
| **Google One** | $3.29 | Monthly | 10/04/25 | |
| **Adobe Illustrator** | $22.99 | Monthly | 06/06/25 | May be paused |
| **Grubhub Plus** | $10.98 | Monthly | 10/17/25 | |
| **Ring Security Plan** | $9.99 | Monthly | 09/28/25 | |
| **Rocket Money Premium** | $6.60 | Monthly | 08/07/25 | May be paused |
| **Cursor AI IDE** | ~$22 | Every 37 days | 10/18/25 | Variable |
| **Render.com** | ~$0.54 | Monthly | 10/03/25 | Hosting |

### Home & Auto
| Service | Monthly Cost | Frequency | Last Payment |
|---------|-------------|-----------|--------------|
| **Home Depot Auto Payment** | $160.00 | Monthly | 11/18/25 | Store credit |
| **Allstate Insurance** | ~$235 | Monthly | Multiple entries | Auto/home insurance |

### Recurring Purchases
| Service | Estimated Monthly | Frequency | Last Payment | Notes |
|---------|------------------|-----------|--------------|-------|
| **Chewy.com** | ~$268 | Every 10 days | 11/25/25 | Pet supplies |
| **Apple Services** | ~$73 | Every 6 days | 11/21/25 | iCloud, App Store, etc. |

---

## 🍽️ FREQUENT PURCHASES (Not Bills)

These appear frequently but are discretionary purchases:

### Food & Dining
- **Leo's Bread** - ~$55/month (weekly)
- **Whole Foods** - Multiple locations, ~$300-700/month
- **Rouses Market** - Multiple locations, ~$50-150/month
- **Various Restaurants & Bars** - Significant spending, review individually

### Transportation
- **Uber/Uber Eats** - ~$270/month (variable)
- **MTA (NYC Transit)** - When traveling

### Other Frequent Merchants
- **Amazon** - Various purchases
- **Venmo Payments** - Variable amounts

---

## 💰 ESTIMATED TOTAL MONTHLY RECURRING BILLS

### High Confidence Bills (Actual Monthly Bills)
```
Mortgage (PennyMac):        $3,094.74
Apple Card Payment:           $516.94
Discover Card Payment:        $289.00
Wells Fargo CC:               $119.00
Citi Card (avg):              ~$159.00
Entergy (Electric):           ~$153.00
SWBNO (Water/Sewer):           ~$61.00
Cox Communications:           $109.99
Cricket Wireless:              $90.00
Allstate Insurance:           ~$235.00
Home Depot:                   $160.00
─────────────────────────────────────
Subtotal:                   ~$4,987.67
```

### Subscriptions
```
Netflix:                      $19.79
Hulu:                         $20.89
Spotify:                      $18.69
OpenAI ChatGPT:               $22.00
Microsoft 365:                 $9.99
Google One:                    $3.29
Adobe Illustrator:            $22.99
Grubhub Plus:                $10.98
Ring Security:                 $9.99
Rocket Money:                  $6.60
Cursor AI:                    ~$22.00
Render.com:                    ~$0.54
─────────────────────────────────────
Subtotal:                    ~$166.75
```

### Recurring Purchases
```
Chewy.com (Pet):             ~$268.00
Apple Services:              ~$73.00
─────────────────────────────────────
Subtotal:                    ~$341.00
```

### **TOTAL ESTIMATED MONTHLY COMMITMENTS: ~$5,495.42**

*Note: This excludes discretionary spending on food, dining, and entertainment.*

---

## 🔍 RECOMMENDATIONS

### 1. Review Subscriptions
- **Paused/Cancelled?** Check if these are still active:
  - Spotify (last payment 07/28/25)
  - OpenAI ChatGPT (last payment 08/01/25)
  - Adobe Illustrator (last payment 06/06/25)
  - Rocket Money (last payment 08/07/25)

### 2. Credit Card Payments
- Consider consolidating or adjusting payment amounts
- Citi card shows bi-weekly payments - verify if this is intentional

### 3. Variable Bills
- Monitor Entergy (electric) - varies significantly
- SWBNO (water) - varies by usage

### 4. Categorize for Budgeting
- Create categories:
  - **Fixed Bills** (mortgage, utilities, insurance)
  - **Credit Card Payments**
  - **Subscriptions** (entertainment, software)
  - **Recurring Services** (Chewy, Apple services)

### 5. Track Discretionary Spending
- Food/dining appears to be significant
- Review restaurant/bar spending patterns
- Consider setting budgets for these categories

---

## 📊 DATA SOURCES

- Full analysis JSON: `docs/recurring_payments_analysis.json`
- Analysis script: `scripts/analyze_recurring_transactions.js`
- Source CSV: `docs/2025-11-28_360Checking...3413.csv`

---

*This analysis is based on transaction patterns and may include some false positives. Review each item to confirm it's actually a recurring bill you want to track.*

