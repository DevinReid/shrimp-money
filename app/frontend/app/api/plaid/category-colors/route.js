import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
const prisma = require('@/lib/prisma');

/**
 * GET /api/plaid/category-colors
 * Get all category color preferences
 */
export async function GET(req) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    if (!prisma) {
      return NextResponse.json({
        success: true,
        colors: {},
      });
    }

    // Check if PlaidCategoryColor model exists
    if (!prisma.plaidCategoryColor) {
      return NextResponse.json({
        success: true,
        colors: {},
      });
    }

    const categoryColors = await prisma.plaidCategoryColor.findMany();
    
    // Convert to object format: { category: color }
    const colors = {};
    categoryColors.forEach(cc => {
      colors[cc.category] = cc.color;
    });

    return NextResponse.json({
      success: true,
      colors,
    });
  } catch (error) {
    console.error('Error fetching category colors:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

/**
 * POST /api/plaid/category-colors
 * Save or update a category color
 */
export async function POST(req) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    const { category, color } = await req.json();

    if (!category || !color) {
      return NextResponse.json({
        error: 'Category and color are required',
      }, { status: 400 });
    }

    // Validate color format (hex)
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return NextResponse.json({
        error: 'Invalid color format. Must be a hex color (e.g., #10b981)',
      }, { status: 400 });
    }

    if (!prisma) {
      return NextResponse.json({
        error: 'Database not available',
      }, { status: 500 });
    }

    // Check if PlaidCategoryColor model exists (Prisma client might need regeneration)
    if (!prisma.plaidCategoryColor) {
      return NextResponse.json({
        error: 'Category color feature not available. Please restart the server to enable this feature.',
      }, { status: 503 });
    }

    // Upsert: update if exists, create if not
    const categoryColor = await prisma.plaidCategoryColor.upsert({
      where: { category },
      update: { color },
      create: { category, color },
    });

    return NextResponse.json({
      success: true,
      categoryColor,
    });
  } catch (error) {
    console.error('Error saving category color:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

