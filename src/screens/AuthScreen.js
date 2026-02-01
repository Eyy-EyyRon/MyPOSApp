import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  Alert, KeyboardAvoidingView, Platform, StatusBar, ScrollView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// --- THEME COLORS ---
const COLORS = {
  primary: '#4F46E5',    
  dark: '#111827',       
  bg: '#F9FAFB',         
  white: '#FFFFFF',
  gray: '#9CA3AF',
  inputBg: '#F3F4F6',
  borderColor: '#E5E7EB',
  danger: '#EF4444',
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  }
};

// ✅ FIX: Defined OUTSIDE the main component to prevent keyboard closing
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

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  
  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [storeName, setStoreName] = useState('');

  // --- HANDLE AUTH ---
  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert("Missing Fields", "Please enter both email and password.");
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        // --- LOGIN ---
        const { error } = await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        });
        if (error) throw error;
      } else {
        // --- SIGN UP (Manager) ---
        if (!firstName || !storeName) {
           Alert.alert("Missing Fields", "Name and Store Name are required.");
           setLoading(false);
           return;
        }

        const { error } = await supabase.auth.signUp({
          email: email,
          password: password,
          options: {
            data: {
              first_name: firstName,
              store_name: storeName,
              role: 'manager', 
            },
          },
        });

        if (error) throw error;
        Alert.alert("Success", "Account created! You can now log in.");
        setIsLogin(true); 
      }
    } catch (error) {
      Alert.alert("Authentication Failed", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {/* HEADER ICON */}
            <View style={styles.logoContainer}>
              <View style={styles.logoCircle}>
                <Ionicons name="storefront" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.title}>{isLogin ? "Welcome Back" : "Create Account"}</Text>
              <Text style={styles.subtitle}>
                {isLogin ? "Sign in to manage your store" : "Start your business today"}
              </Text>
            </View>

            {/* EXTRA FIELDS FOR SIGN UP */}
            {!isLogin && (
              <>
                <InputField icon="person-outline" placeholder="First Name" value={firstName} onChange={setFirstName} autoCap="words" />
                <View style={{height: 15}} />
                <InputField icon="business-outline" placeholder="Store Name" value={storeName} onChange={setStoreName} autoCap="words" />
                <View style={{height: 15}} />
              </>
            )}

            {/* COMMON FIELDS */}
            <InputField icon="mail-outline" placeholder="Email Address" value={email} onChange={setEmail} />
            <View style={{height: 15}} />
            <InputField icon="lock-closed-outline" placeholder="Password" value={password} onChange={setPassword} secure={true} />

            {/* ACTION BUTTON */}
            <TouchableOpacity 
              style={[styles.button, loading && { opacity: 0.7 }]} 
              onPress={handleAuth} 
              disabled={loading}
            >
              <Text style={styles.btnText}>
                {loading ? "Processing..." : (isLogin ? "Sign In" : "Register Manager")}
              </Text>
              {!loading && <Ionicons name="arrow-forward" size={20} color={COLORS.white} style={{marginLeft: 10}} />}
            </TouchableOpacity>

            {/* TOGGLE LINK */}
            <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.switchBtn}>
              <Text style={styles.switchText}>
                {isLogin ? "New here? " : "Already have an account? "}
                <Text style={styles.switchTextBold}>{isLogin ? "Create Manager Account" : "Log In"}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 30,
    ...COLORS.shadow
  },
  
  logoContainer: { alignItems: 'center', marginBottom: 30 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#EEF2FF', 
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 15
  },
  title: { fontSize: 24, fontWeight: 'bold', color: COLORS.dark },
  subtitle: { fontSize: 14, color: COLORS.gray, marginTop: 5 },

  inputContainer: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.inputBg, 
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderColor, 
    height: 55, paddingHorizontal: 15
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: COLORS.dark, height: '100%' },

  button: { 
    backgroundColor: COLORS.primary, 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 12, marginTop: 25,
    ...COLORS.shadow 
  },
  btnText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 },

  switchBtn: { marginTop: 20, alignItems: 'center' },
  switchText: { color: COLORS.gray, fontSize: 14 },
  switchTextBold: { color: COLORS.primary, fontWeight: 'bold' },
});