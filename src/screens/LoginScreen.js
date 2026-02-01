import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, 
  ActivityIndicator, KeyboardAvoidingView, Platform, BackHandler, ScrollView 
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen({ onLoginSuccess }) {
  // --- STATE ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // New Fields for Sign Up
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [storeName, setStoreName] = useState(''); 
  
  const [loading, setLoading] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true); // True = Login, False = Sign Up

  // Helper to clear fields when switching views
  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFirstName('');
    setLastName('');
    setStoreName('');
  };

  const toggleMode = () => {
    resetForm();
    setIsLoginMode(!isLoginMode);
  };

  // --- HANDLE ANDROID BACK BUTTON ---
  useEffect(() => {
    const backAction = () => {
      if (!isLoginMode) {
        toggleMode();
        return true; 
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [isLoginMode]); 

  // --- 1. LOGIN LOGIC ---
  const handleLogin = async () => {
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      Alert.alert("Login Failed", error.message);
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    setLoading(false);

    if (profileError) {
      Alert.alert("Error", "Profile not found. Please contact support.");
      return;
    }

    if (!profile.is_verified) {
      Alert.alert(
        "Access Pending", 
        "Your account is waiting for Owner verification. You cannot login yet."
      );
      await supabase.auth.signOut();
      return;
    }

    onLoginSuccess(profile);
  };

  // --- 2. SIGN UP LOGIC (UPDATED) ---
  const handleSignUp = async () => {
    // Validate all fields
    if (!email || !password || !storeName || !firstName || !lastName) {
      Alert.alert("Missing Info", "Please fill in all fields.");
      return;
    }

    setLoading(true);

    // A. Create Auth User
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (error) {
      Alert.alert("Sign Up Failed", error.message);
      setLoading(false);
      return;
    }

    // B. Create Profile Row with Name & Store
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: data.user.id,
          role: 'manager', 
          first_name: firstName, // <--- SAVING FIRST NAME
          last_name: lastName,   // <--- SAVING LAST NAME
          store_name: storeName, 
          is_verified: false, 
          is_password_changed: true // Managers set their own password, so this is TRUE
        }]);

      setLoading(false);

      if (profileError) {
        Alert.alert("Database Error", profileError.message);
      } else {
        Alert.alert(
          "Registration Successful", 
          "Account created! \n\nPlease ask the App Owner to verify you so you can log in."
        );
        toggleMode();
      }
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"} 
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {isLoginMode ? "POS Login" : "New Manager"}
          </Text>
          <Text style={styles.subtitle}>
            {isLoginMode ? "Enter credentials to access" : "Register yourself and your store"}
          </Text>
          
          <View style={styles.inputContainer}>
            
            {/* NEW: First & Last Name (Only in Sign Up Mode) */}
            {!isLoginMode && (
              <View style={styles.row}>
                <TextInput 
                  style={[styles.input, styles.halfInput]} 
                  placeholder="First Name" 
                  value={firstName} 
                  onChangeText={setFirstName} 
                />
                <TextInput 
                  style={[styles.input, styles.halfInput]} 
                  placeholder="Last Name" 
                  value={lastName} 
                  onChangeText={setLastName} 
                />
              </View>
            )}

            {/* Email & Password (Always Visible) */}
            <TextInput 
              style={styles.input} 
              placeholder="Email Address" 
              value={email} 
              onChangeText={setEmail} 
              autoCapitalize="none" 
              keyboardType="email-address"
            />
            <TextInput 
              style={styles.input} 
              placeholder="Password" 
              value={password} 
              onChangeText={setPassword} 
              secureTextEntry 
            />

            {/* Store Name (Only in Sign Up Mode) */}
            {!isLoginMode && (
              <TextInput 
                style={styles.input} 
                placeholder="Store Name (e.g. Branch 1)" 
                value={storeName} 
                onChangeText={setStoreName} 
              />
            )}
          </View>

          {/* Action Button */}
          <TouchableOpacity 
            style={styles.button} 
            onPress={isLoginMode ? handleLogin : handleSignUp} 
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isLoginMode ? "Login" : "Sign Up"}
              </Text>
            )}
          </TouchableOpacity>

          {/* Switch Mode Button */}
          <TouchableOpacity style={styles.switchButton} onPress={toggleMode}>
            <Text style={styles.switchText}>
              {isLoginMode 
                ? "New here? Create Manager Account" 
                : "Already have an account? Login"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 15, padding: 30, elevation: 5, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10 },
  title: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', color: '#1F2937', marginBottom: 5 },
  subtitle: { fontSize: 14, textAlign: 'center', color: '#6B7280', marginBottom: 25 },
  inputContainer: { marginBottom: 10 },
  input: { backgroundColor: '#F9FAFB', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 16 },
  
  // Style for side-by-side inputs
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  halfInput: { width: '48%' },

  button: { backgroundColor: '#10B981', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  switchButton: { marginTop: 25, alignItems: 'center' },
  switchText: { color: '#10B981', fontWeight: '600', fontSize: 14 }
});