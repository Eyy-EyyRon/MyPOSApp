import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Switch, Alert, ScrollView, SafeAreaView, Platform, StatusBar 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { supabase } from '../lib/supabase';

const COLORS = {
  primary: '#4F46E5',
  dark: '#111827',
  light: '#F3F4F6',
  white: '#FFFFFF',
  gray: '#6B7280',
  danger: '#EF4444',
  cardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  }
};

export default function SettingsScreen({ user }) {
  const [printerSelected, setPrinterSelected] = useState(false);

  // --- ACTIONS ---
  const handleLogout = async () => {
    Alert.alert("Log Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Log Out", 
        style: "destructive", 
        onPress: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) Alert.alert("Error", error.message);
        }
      }
    ]);
  };

  const handleTestPrint = async () => {
    try {
      // Simple test print
      const html = `
        <html>
          <body style="text-align: center;">
            <h1>Test Print</h1>
            <p>If you can read this, your printer is working!</p>
            <p>Store: ${user?.store_name || "My Store"}</p>
          </body>
        </html>
      `;
      await Print.printAsync({ html });
    } catch (error) {
      Alert.alert("Printer Error", "Could not send test print.");
    }
  };

  const OptionRow = ({ icon, label, onPress, isDestructive = false, value = null }) => (
    <TouchableOpacity 
      style={styles.row} 
      onPress={onPress} 
      activeOpacity={0.7}
      disabled={value !== null} // Disable press if it's a switch row
    >
      <View style={styles.rowLeft}>
        <View style={[styles.iconBox, isDestructive && styles.iconDestructive]}>
          <Ionicons name={icon} size={20} color={isDestructive ? COLORS.danger : COLORS.primary} />
        </View>
        <Text style={[styles.rowLabel, isDestructive && styles.textDestructive]}>{label}</Text>
      </View>
      
      {value !== null ? (
        <Switch 
          value={value} 
          onValueChange={onPress} 
          trackColor={{ false: "#767577", true: COLORS.primary }}
        />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.dark} />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        
        {/* PROFILE CARD */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.first_name ? user.first_name[0].toUpperCase() : "M"}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.first_name || "Manager"}</Text>
            <Text style={styles.profileRole}>
              {user?.role ? user.role.toUpperCase() : "MANAGER"}
            </Text>
            <Text style={styles.storeName}>{user?.store_name || "My Store"}</Text>
          </View>
        </View>

        {/* SECTION: PRINTER */}
        <Text style={styles.sectionHeader}>Hardware</Text>
        <View style={styles.sectionContainer}>
          <OptionRow 
            icon="print-outline" 
            label="Test Printer" 
            onPress={handleTestPrint} 
          />
        </View>

        {/* SECTION: ACCOUNT */}
        <Text style={styles.sectionHeader}>Account</Text>
        <View style={styles.sectionContainer}>
          <OptionRow 
            icon="log-out-outline" 
            label="Log Out" 
            onPress={handleLogout} 
            isDestructive={true} 
          />
        </View>

        <Text style={styles.versionText}>Version 1.0.0</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { 
    backgroundColor: COLORS.dark, 
    paddingTop: Platform.OS === 'android' ? 40 : 10, 
    paddingBottom: 20, 
    alignItems: 'center', 
    justifyContent: 'center',
    ...COLORS.cardShadow
  },
  headerTitle: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  
  body: { padding: 20 },
  
  // PROFILE CARD
  profileCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
    ...COLORS.cardShadow
  },
  avatar: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 15
  },
  avatarText: { fontSize: 24, fontWeight: 'bold', color: COLORS.primary },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark },
  profileRole: { fontSize: 12, color: COLORS.gray, marginTop: 2, letterSpacing: 1 },
  storeName: { fontSize: 14, color: COLORS.primary, marginTop: 4, fontWeight: '600' },

  // SECTIONS
  sectionHeader: { fontSize: 14, fontWeight: 'bold', color: COLORS.gray, marginBottom: 10, marginLeft: 5, textTransform: 'uppercase' },
  sectionContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 25,
    ...COLORS.cardShadow
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center' },
  iconBox: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12
  },
  iconDestructive: { backgroundColor: '#FEF2F2' },
  rowLabel: { fontSize: 16, color: COLORS.dark },
  textDestructive: { color: COLORS.danger, fontWeight: '600' },
  
  versionText: { textAlign: 'center', color: '#CBD5E1', marginTop: 20 },
});