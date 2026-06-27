import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
const prisma = require('@/lib/prisma');

// Predefined categories
const PREDEFINED_CATEGORIES = [
  'Subscription',
  'One-time Purchase',
  'Bill',
  'Transfer',
  'Income',
  'Other',
  'Uncategorized',
];

/**
 * GET /api/plaid/categories
 * Get all categories (predefined + custom)
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
    let customCategories = [];
    
    if (prisma && prisma.plaidCustomCategory) {
      try {
        const custom = await prisma.plaidCustomCategory.findMany({
          orderBy: { name: 'asc' },
        });
        customCategories = custom.map(c => c.name);
        // Filter out any custom categories that are also predefined (shouldn't happen, but safety check)
        customCategories = customCategories.filter(cat => !PREDEFINED_CATEGORIES.includes(cat));
      } catch (dbError) {
        console.log('⚠️ Could not read custom categories from database:', dbError.message);
      }
    } else if (prisma && !prisma.plaidCustomCategory) {
      console.log('⚠️ Prisma client not regenerated - custom categories model not available. Run: npx prisma generate');
    }

    // Ensure no duplicates in predefined list (safety check)
    const uniquePredefined = [...new Set(PREDEFINED_CATEGORIES)];

    return NextResponse.json({
      predefined: uniquePredefined,
      custom: customCategories,
      all: [...uniquePredefined, ...customCategories],
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

/**
 * POST /api/plaid/categories
 * Create a new custom category
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
    const { name } = await req.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // Check if it's a predefined category
    if (PREDEFINED_CATEGORIES.includes(trimmedName)) {
      return NextResponse.json(
        { error: 'This is a predefined category and cannot be created as custom' },
        { status: 400 }
      );
    }

    if (!prisma || !prisma.plaidCustomCategory) {
      return NextResponse.json(
        { error: 'Database not available or Prisma client needs regeneration. Run: npx prisma generate' },
        { status: 500 }
      );
    }

    // Check if category already exists
    const existing = await prisma.plaidCustomCategory.findUnique({
      where: { name: trimmedName },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Category already exists' },
        { status: 409 }
      );
    }

    // Create new custom category
    const category = await prisma.plaidCustomCategory.create({
      data: {
        name: trimmedName,
      },
    });

    return NextResponse.json({
      success: true,
      category: {
        id: category.id,
        name: category.name,
      },
    });
  } catch (error) {
    console.error('Error creating category:', error);
    
    // Handle unique constraint violation
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Category already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

