import supabase from './CreateClient';

export interface UserData {
  id?: string;
  email: string;
  fullname?: string; // ✅ Aligned to lowercase match physical table column
  role?: 'student' | 'nas' | 'it' | 'cpe_faculty'; // ✅ Aligned to match underscore used in DB
  student_or_staff_id?: string | null;
  program?: string | null;
  created_at?: string; // ✅ Aligned to snake_case table column
}

function buildFallbackProfile(
  userId: string,
  email: string,
  fullname: string,
  role: string,
  studentOrStaffId?: string | null,
  program?: string | null
): UserData {
  return {
    id: userId,
    email,
    fullname,
    role: role as UserData['role'],
    student_or_staff_id: studentOrStaffId ?? null,
    program: program ?? null,
    created_at: new Date().toISOString(),
  };
}

// Fixed to handle raw/empty server crash objects gracefully
function toUserFriendlyAuthError(error: unknown): Error {
  if (error && typeof error === 'object') {
    const message = 'message' in error ? String((error as { message?: string }).message ?? '') : '';

    if (message.includes('email rate limit exceeded')) {
      return new Error('Too many sign-up attempts. Please wait a few minutes and try again.');
    }
    if (message.includes('Email not confirmed')) {
      return new Error('Please confirm your email before signing in. Check your inbox for the confirmation link.');
    }
    if (message.includes('Invalid login credentials')) {
      return new Error('Incorrect email or password.');
    }
    if (message.includes('rate limit')) {
      return new Error('Too many attempts. Please wait a moment and try again.');
    }
    if (message.includes('User already registered')) {
      return new Error('This email is already registered. Please sign in instead.');
    }

    return new Error(message || 'A database or server error occurred during authentication.');
  }
  return new Error('An unexpected connection error occurred.');
}

// CREATE - Sign up new user
export async function signUp(
  email: string,
  password: string,
  fullName: string,
  role: string,
  studentOrStaffId?: string,
  program?: string
) {
  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          student_or_staff_id: studentOrStaffId ?? null,
          program: program ?? null,
        },
      },
    });

    if (authError) throw toUserFriendlyAuthError(authError);
    if (!authData.user) throw new Error('User creation failed');

    // Safe fallback profile matching the interface structure
    const profile = buildFallbackProfile(
      authData.user.id,
      email,
      fullName,
      role,
      studentOrStaffId,
      program
    );

    return { success: true, user: authData.user, profile };
  } catch (error) {
    console.error('Sign up error:', error);
    throw error;
  }
}

// READ - Sign in user
export async function signIn(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw toUserFriendlyAuthError(error);

    // Fetch user profile from public table
    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError) {
      const fallbackProfile = buildFallbackProfile(
        data.user.id,
        data.user.email ?? email,
        (data.user.user_metadata?.full_name as string | undefined) ?? '',
        (data.user.user_metadata?.role as string | undefined) ?? 'student',
        (data.user.user_metadata?.student_or_staff_id as string | undefined) ?? null,
        (data.user.user_metadata?.program as string | undefined) ?? null
      );
      console.warn('Profile lookup skipped; using fallback profile data.', profileError);
      return { success: true, user: data.user, profile: fallbackProfile };
    }

    return { success: true, user: data.user, profile: profileData ?? null };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  }
}

// READ - Get current user
export async function getCurrentUser() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
}

// READ - Get user profile
export async function getUserProfile(userId: string): Promise<UserData | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Profile lookup skipped; returning null.', error);
      return null;
    }
    return data;
  } catch (error) {
    console.error('Get user profile error:', error);
    return null;
  }
}

// UPDATE - Update user profile
export async function updateUserProfile(userId: string, updates: Partial<UserData>) {
  try {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select();

    if (error) throw error;
    return { success: true, profile: data && data.length > 0 ? data[0] : null };
  } catch (error) {
    console.error('Update user profile error:', error);
    throw error;
  }
}

// Sign out
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
}