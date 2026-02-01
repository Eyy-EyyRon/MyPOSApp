import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  Alert, KeyboardAvoidingView, Platform, StatusBar, ScrollView, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// --- THEME ---
const COLORS = {
  primary: '#130f5f',    
  dark: '#111827',       
  bg: '#F9FAFB',         
  white: '#FFFFFF',
  gray: '#9CA3AF',
  inputBg: '#F3F4F6',
  borderColor: '#E5E7EB',
  danger: '#EF4444',
  success: '#10B981',
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  }
};

const InputField = ({ icon, placeholder, value, onChange, secure = false, autoCap = "none" }) => (
  <View style={styles.inputContainer}>
    <Ionicons name={icon} size={20} color={COLORS.gray} style={styles.inputIcon} />
    <TextInput 
      style={styles.input} 
      placeholder={placeholder}
      placeholderTextColor={COLORS.gray}
      value={value} 
      onChangeText={onChange} 
      secureTextEntry={secure}
      autoCapitalize={autoCap}
    />
  </View>
);

export default function AuthScreen({ isBanned, forcePasswordChange }) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  
  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Registration State
  const [firstName, setFirstName] = useState('');
  const [storeName, setStoreName] = useState('');

  // Password Change State (Handled by App.js mostly, but UI here for fallback)
  const [showForceChange, setShowForceChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (forcePasswordChange) setShowForceChange(true);
  }, [forcePasswordChange]);

  const handleAuth = async () => {
    if (!email || !password) return Alert.alert("Missing Fields", "Please enter email and password.");
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        if (!firstName || !storeName) {
           setLoading(false);
           return Alert.alert("Missing Fields", "Name and Store Name are required.");
        }
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { first_name: firstName, store_name: storeName, role: 'manager' } },
        });
        if (error) throw error;
        Alert.alert("Success", "Account created! You can now log in.");
        setIsLogin(true); 
      }
    } catch (error) {
      Alert.alert("Authentication Failed", error.message);
    } finally {
      if (!forcePasswordChange) setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) return Alert.alert("Weak Password", "Password must be at least 6 characters.");
    if (newPassword !== confirmPassword) return Alert.alert("Mismatch", "Passwords do not match.");
    
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      const { data: { user } } = await supabase.auth.getUser();
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', user.id);
      
      if (profileError) throw profileError;

      Alert.alert("Success", "Password updated successfully!");
      setShowForceChange(false); 
      
    } catch (error) {
      Alert.alert("Update Failed", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setShowForceChange(false);
    setLoading(false);
  };

  // --- BANNED UI ---
  if (isBanned) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: 30 }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.bannedIconCircle}>
          <Ionicons name="lock-closed" size={50} color={COLORS.danger} />
        </View>
        <Text style={styles.bannedTitle}>Account Suspended</Text>
        <Text style={styles.bannedText}>Your access to this store has been revoked.</Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- FORCE CHANGE PASSWORD UI ---
  if (showForceChange) {
    return (
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={styles.container}
      >
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.logoContainer}>
              <View style={[styles.logoCircle, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="key" size={40} color="#D97706" />
              </View>
              <Text style={styles.title}>Change Password</Text>
              <Text style={styles.subtitle}>Action Required: Update your password to continue.</Text>
            </View>

            <InputField icon="lock-closed-outline" placeholder="New Password" value={newPassword} onChange={setNewPassword} secure={true} />
            <View style={{height: 15}} />
            <InputField icon="checkmark-circle-outline" placeholder="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} secure={true} />

            <TouchableOpacity style={styles.button} onPress={handleChangePassword} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Update Password</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleLogout} style={styles.switchBtn}>
              <Text style={styles.switchTextBold}>Cancel & Sign Out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // --- MAIN LOGIN / REGISTER UI ---
  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"} 
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      
      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Ionicons name="storefront" size={40} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>{isLogin ? "Welcome Back" : "Create Account"}</Text>
            <Text style={styles.subtitle}>{isLogin ? "Sign in to manage your store" : "Start your business today"}</Text>
          </View>

          {!isLogin && (
            <>
              <InputField icon="person-outline" placeholder="First Name" value={firstName} onChange={setFirstName} autoCap="words" />
              <View style={{height: 15}} />
              <InputField icon="business-outline" placeholder="Store Name" value={storeName} onChange={setStoreName} autoCap="words" />
              <View style={{height: 15}} />
            </>
          )}

          <InputField icon="mail-outline" placeholder="Email Address" value={email} onChange={setEmail} />
          <View style={{height: 15}} />
          <InputField icon="lock-closed-outline" placeholder="Password" value={password} onChange={setPassword} secure={true} />

          <TouchableOpacity style={[styles.button, loading && { opacity: 0.7 }]} onPress={handleAuth} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{isLogin ? "Sign In" : "Register Manager"}</Text>}
            {!loading && <Ionicons name="arrow-forward" size={20} color={COLORS.white} style={{marginLeft: 10}} />}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.switchBtn}>
            <Text style={styles.switchText}>
              {isLogin ? "New here? " : "Already have an account? "}
              <Text style={styles.switchTextBold}>{isLogin ? "Create Manager Account" : "Log In"}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { 
    flexGrow: 1, 
    justifyContent: 'center', 
    padding: 20,
    paddingBottom: 40 // Extra padding for scrolling
  },
  card: { backgroundColor: COLORS.white, borderRadius: 20, padding: 30, ...COLORS.shadow },
  logoContainer: { alignItems: 'center', marginBottom: 30 },
  logoCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  title: { fontSize: 24, fontWeight: 'bold', color: COLORS.dark },
  subtitle: { fontSize: 14, color: COLORS.gray, marginTop: 5, textAlign: 'center' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.inputBg, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderColor, height: 55, paddingHorizontal: 15 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: COLORS.dark, height: '100%' },
  button: { backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, marginTop: 25, ...COLORS.shadow },
  btnText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 },
  switchBtn: { marginTop: 20, alignItems: 'center' },
  switchText: { color: COLORS.gray, fontSize: 14 },
  switchTextBold: { color: COLORS.primary, fontWeight: 'bold' },
  
  // BANNED & PASSWORD UI
  bannedIconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  bannedTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.dark, marginBottom: 10 },
  bannedText: { fontSize: 16, color: COLORS.gray, textAlign: 'center', marginBottom: 30 },
  logoutBtn: { paddingVertical: 12, paddingHorizontal: 30, borderRadius: 8, backgroundColor: COLORS.dark },
  logoutText: { color: COLORS.white, fontWeight: 'bold' }
});