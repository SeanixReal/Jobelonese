# TechFix Authentication Setup Guide

## Overview
This guide explains how to set up authentication and CRUD operations for the TechFix application using Supabase.

## What's Been Implemented

### 1. **Environment Variables (.env.local)**
- Securely stores Supabase credentials
- Already created with your API keys
- **Important:** Never commit `.env.local` to version control (already in .gitignore)

### 2. **Auth Service (src/authService.ts)**
Implements full CRUD operations:

#### CREATE
- `signUp(email, password, fullName, role)` - Register new user
  - Creates auth user in Supabase Auth
  - Stores user profile in database

#### READ
- `signIn(email, password)` - Authenticate user and fetch profile
- `getCurrentUser()` - Get current authenticated user
- `getUserProfile(userId)` - Fetch user profile by ID

#### UPDATE
- `updateUserProfile(userId, updates)` - Update user profile information

#### DELETE
- `deleteUserAccount(userId)` - Delete user account and associated data
- `signOut()` - Sign out current user

### 3. **Updated Components**

**src/signin.tsx**
- Integrated auth service for login
- Added error handling
- Added loading states
- Form validation

**src/signup.tsx**
- Integrated auth service for registration
- Added error handling
- Added loading states
- Form validation

## Setup Instructions

### Step 1: Set Up Supabase Database
1. Go to [Supabase Console](https://app.supabase.com)
2. Open your TechFix project
3. Go to SQL Editor
4. Create a new query and copy the entire content from `DATABASE_SETUP.sql`
5. Execute the query to create the `users` table with security policies

### Step 2: Verify Environment Variables
The `.env.local` file should contain:
```
VITE_SUPABASE_URL=https://hdqysptfslyqihusgprb.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_SIy8mURo4FoBC2TdqN4nxw__tdKM_1H
```

### Step 3: Test the Authentication
1. Start the dev server: `npm run dev`
2. Navigate to the signup page
3. Create a new account
4. Check Supabase console to verify:
   - User created in Auth section
   - Profile created in users table
5. Sign out and test login with your credentials

## Security Features

✅ **Credentials Protection**
- API keys stored in environment variables
- `.env.local` excluded from version control

✅ **Row Level Security (RLS)**
- Users can only view/edit their own profiles
- Enforced at database level

✅ **Auth Best Practices**
- Passwords handled by Supabase (never stored in frontend)
- Session management handled by Supabase client
- Error messages sanitized

## API Reference

### signUp(email, password, fullName, role)
```typescript
try {
  const result = await signUp(
    'student@cit.edu',
    'password123',
    'Juan Dela Cruz',
    'student'
  );
  console.log(result.user, result.profile);
} catch (error) {
  console.error('Signup failed:', error);
}
```

### signIn(email, password)
```typescript
try {
  const result = await signIn('student@cit.edu', 'password123');
  console.log('Signed in as:', result.profile.fullName);
} catch (error) {
  console.error('Login failed:', error);
}
```

### updateUserProfile(userId, updates)
```typescript
try {
  const result = await updateUserProfile(userId, {
    fullName: 'Juan dela Cruz Updated',
    role: 'nas'
  });
} catch (error) {
  console.error('Update failed:', error);
}
```

### deleteUserAccount(userId)
```typescript
try {
  const result = await deleteUserAccount(userId);
  console.log('Account deleted');
} catch (error) {
  console.error('Deletion failed:', error);
}
```

## Troubleshooting

### "User already exists" error during signup
- The email is already registered
- Try signing in instead
- Use password reset if you forgot credentials

### "Invalid login credentials"
- Check your email and password
- Ensure the user was created successfully in Supabase

### CORS or API errors
- Verify `.env.local` has correct Supabase URL and keys
- Ensure Supabase project is active
- Check browser console for detailed error messages

### Database table doesn't exist
- Run the DATABASE_SETUP.sql script in Supabase SQL Editor
- Verify RLS policies are enabled

## Next Steps

1. ✅ Set up database schema (DATABASE_SETUP.sql)
2. ✅ Configure environment variables (.env.local)
3. ✅ Test signup and signin flows
4. 📝 Add "Forgot Password" functionality
5. 📝 Add email verification
6. 📝 Add user profile management page
7. 📝 Add logout functionality to main app

