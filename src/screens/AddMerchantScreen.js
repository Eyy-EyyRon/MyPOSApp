import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, 
  SafeAreaView, StatusBar, Platform, KeyboardAvoidingView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createMerchantAccount } from '../lib/admin'; 

// --- THEME COLORS ---
const COLORS = {
  primary: '#4F46E5',    // Indigo
  dark: '#111827',       // Header Dark
  bg: '#F9FAFB',         // Light Background
  white: '#FFFFFF',
  text: '#1F2937',
  gray: '#9CA3AF',
  inputBg: '#F3F4F6',
  borderColor: '#E5E7EB',
  success: '#10B981',
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  }
};

export default function AddMerchantScreen({ managerId, onBack }) {
  const [firstName, setFirst] = useState('');
  const [lastName, setLast] = useState('');
  const [storeName, setStore] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!firstName || !lastName || !storeName || !email || !password) {
      Alert.alert("Missing Fields", "Please fill in all fields.");
      return;
    }

    setLoading(true);
    
    const { error } = await createMerchantAccount(
      email, password, firstName, lastName, storeName, managerId
    );

    setLoading(false);

    if (error) {
      Alert.alert("Failed", error.message);
    } else {
      Alert.alert("Success", "Merchant Account Created!");
      onBack(); 
    }
  };

  // Helper Component for Inputs with Icons
  const InputField = ({ icon, placeholder, value, onChange, secure = false, type = 'default' }) => (
    <View style={styles.inputContainer}>
      <View style={styles.inputIcon}>
        <Ionicons name={icon} size={20} color={COLORS.gray} />
      </View>
      <TextInput 
        style={styles.input} 
        placeholder={placeholder}
        placeholderTextColor={COLORS.gray}
        value={value} 
        onChangeText={onChange} 
        secureTextEntry={secure}
        autoCapitalize="none"
        keyboardType={type}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.dark} />

      {/* --- TOP HEADER --- */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Merchant</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          {/* SECTION 1: IDENTITY */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Merchant Identity</Text>
            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <InputField icon="person-outline" placeholder="First Name" value={firstName} onChange={setFirst} />
              </View>
              <View style={{ flex: 1 }}>
                <InputField icon="person-outline" placeholder="Last Name" value={lastName} onChange={setLast} />
              </View>
            </View>
          </View>

          {/* SECTION 2: STORE */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Store Assignment</Text>
            <InputField icon="storefront-outline" placeholder="Store Name (e.g. Branch 1)" value={storeName} onChange={setStore} />
          </View>

          {/* SECTION 3: SECURITY */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Login Credentials</Text>
            <InputField 
              icon="mail-outline" 
              placeholder="Email Address" 
              value={email} 
              onChange={setEmail} 
              type="email-address"
            />
            <View style={{ height: 15 }} />
            <InputField 
              icon="lock-closed-outline" 
              placeholder="Password" 
              value={password} 
              onChange={setPassword} 
              secure={true}
            />
          </View>

          {/* Spacer for bottom bar */}
          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* --- BOTTOM NAVBAR (Sticky Action Bar) --- */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onBack}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.createBtn, loading && { opacity: 0.7 }]} 
          onPress={handleCreate} 
          disabled={loading}
        >
          <Text style={styles.createText}>
            {loading ? "Creating..." : "Create Account"}
          </Text>
          {!loading && <Ionicons name="arrow-forward" size={18} color={COLORS.white} style={{ marginLeft: 5 }} />}
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  
  // HEADER
  header: { 
    backgroundColor: COLORS.dark, 
    paddingTop: Platform.OS === 'android' ? 40 : 15, 
    paddingBottom: 15, 
    paddingHorizontal: 20, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    ...COLORS.shadow
  },
  headerTitle: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  backBtn: { padding: 5 },

  // BODY
  scrollContent: { padding: 20 },
  section: { marginBottom: 25 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.gray, marginBottom: 10, textTransform: 'uppercase' },
  row: { flexDirection: 'row' },

  // CUSTOM INPUT
  inputContainer: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, 
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderColor, 
    height: 50, paddingHorizontal: 10
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: COLORS.text, height: '100%' },

  // BOTTOM NAVBAR
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    marginBottom: 20,
    backgroundColor: COLORS.white,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    borderTopWidth: 1, borderTopColor: COLORS.borderColor,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    ...COLORS.shadow,
    elevation: 20
  },
  cancelBtn: { padding: 15 },
  cancelText: { color: COLORS.gray, fontWeight: '600', fontSize: 16 },
  
  createBtn: { 
    backgroundColor: COLORS.primary, 
    flexDirection: 'row', alignItems: 'center', 
    paddingVertical: 14, paddingHorizontal: 24, 
    borderRadius: 12, ...COLORS.shadow 
  },
  createText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 },
});