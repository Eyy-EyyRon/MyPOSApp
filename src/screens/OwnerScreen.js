import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  RefreshControl, StatusBar, SafeAreaView, Platform, FlatList, Alert, ActivityIndicator, Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

const SCREEN_WIDTH = Dimensions.get('window').width;

// --- THEME ---
const COLORS = {
  primary: '#1E1B4B', 
  accent: '#F59E0B', 
  success: '#10B981',
  danger: '#EF4444',
  bg: '#F3F4F6',
  white: '#FFFFFF',
  text: '#1F2937',
  gray: '#9CA3AF',
  cardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  }
};

export default function OwnerScreen() {
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'stores' | 'users' | 'logs'
  const [loading, setLoading] = useState(false);

  // Data States
  const [stats, setStats] = useState({ totalRevenue: 0, totalSalesCount: 0, totalProducts: 0, activeMerchants: 0 });
  const [recentSales, setRecentSales] = useState([]);
  const [usersList, setUsersList] = useState([]); 
  const [auditLogs, setAuditLogs] = useState([]);
  const [storeRankings, setStoreRankings] = useState([]);

  useFocusEffect(
    useCallback(() => {
      if (currentView === 'dashboard') fetchGlobalData();
      else if (currentView === 'stores') fetchStoreRankings();
      else if (currentView === 'users') fetchUsers();
      else if (currentView === 'logs') fetchAuditLogs();
    }, [currentView])
  );

  // --- 1. DASHBOARD LOGIC ---
  const fetchGlobalData = async () => {
    setLoading(true);
    try {
      const { data: allSales } = await supabase.from('sales').select('total_amount');
      const totalRev = (allSales || []).reduce((sum, sale) => sum + (sale.total_amount || 0), 0);
      
      const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
      const { count: merchantCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'merchant').eq('status', 'active');

      setStats({
        totalRevenue: totalRev,
        totalSalesCount: allSales?.length || 0,
        totalProducts: productCount || 0,
        activeMerchants: merchantCount || 0
      });

      const { data: recent } = await supabase.from('sales').select('*').order('sale_date', { ascending: false }).limit(5);
      setRecentSales(recent || []);
    } catch (e) { console.log(e); } 
    finally { setLoading(false); }
  };

  // --- 2. STORE LEADERBOARD LOGIC (New) ---
  const fetchStoreRankings = async () => {
    setLoading(true);
    try {
      // Fetch all sales (lightweight query)
      const { data: salesData, error } = await supabase
        .from('sales')
        .select('store_name, total_amount');

      if (error) throw error;

      // Aggregate Data in JavaScript
      const storeMap = {};

      salesData.forEach(sale => {
        const name = sale.store_name || "Unknown Store";
        if (!storeMap[name]) {
          storeMap[name] = { name, revenue: 0, transactions: 0 };
        }
        storeMap[name].revenue += sale.total_amount;
        storeMap[name].transactions += 1;
      });

      // Convert to Array and Sort Descending
      const rankings = Object.values(storeMap).sort((a, b) => b.revenue - a.revenue);
      setStoreRankings(rankings);

    } catch (e) {
      console.log("Rankings Error:", e.message);
    } finally {
      setLoading(false);
    }
  };

  // --- 3. USER MANAGEMENT LOGIC ---
  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['manager', 'merchant']) 
      .order('role', { ascending: true }) 
      .order('created_at', { ascending: false });
    
    if (!error) setUsersList(data);
    setLoading(false);
  };

  const toggleUserStatus = async (userId, currentStatus, role) => {
    const newStatus = currentStatus === 'active' ? 'banned' : 'active';
    const action = newStatus === 'active' ? 'Activate' : 'Ban';

    Alert.alert(
      `${action} ${role.charAt(0).toUpperCase() + role.slice(1)}?`,
      `Are you sure you want to ${action.toLowerCase()} this account?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Confirm", 
          style: newStatus === 'banned' ? 'destructive' : 'default',
          onPress: async () => {
            const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', userId);
            if (!error) {
              setUsersList(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
            } else {
              Alert.alert("Error", error.message);
            }
          }
        }
      ]
    );
  };

  // --- 4. AUDIT LOG LOGIC ---
  const fetchAuditLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('audit_logs')
      .select(`
        *,
        profiles:actor_id (first_name, last_name, role)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error) setAuditLogs(data || []);
    setLoading(false);
  };

  // --- RENDERERS ---
  const renderStatCard = (title, value, icon, color) => (
    <View style={styles.statCard}>
      <View style={[styles.iconCircle, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View>
        <Text style={styles.statLabel}>{title}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </View>
  );

  const renderStoreRankingItem = ({ item, index }) => {
    const maxRevenue = storeRankings[0]?.revenue || 1;
    const widthPercentage = (item.revenue / maxRevenue) * 100;
    
    let medalColor = COLORS.gray;
    if (index === 0) medalColor = '#FFD700'; // Gold
    if (index === 1) medalColor = '#C0C0C0'; // Silver
    if (index === 2) medalColor = '#CD7F32'; // Bronze

    return (
      <View style={styles.rankingItem}>
        <View style={styles.rankBadge}>
          {index < 3 ? <Ionicons name="trophy" size={20} color={medalColor} /> : <Text style={styles.rankNumber}>#{index + 1}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.rankHeader}>
            <Text style={styles.rankName}>{item.name}</Text>
            <Text style={styles.rankRevenue}>₱{item.revenue.toLocaleString()}</Text>
          </View>
          {/* Progress Bar */}
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${widthPercentage}%` }]} />
          </View>
          <Text style={styles.rankSub}>{item.transactions} transactions</Text>
        </View>
      </View>
    );
  };

  const renderUserItem = ({ item }) => (
    <View style={styles.listItem}>
      <View style={[styles.listAvatar, { backgroundColor: item.role === 'manager' ? COLORS.primary : COLORS.accent }]}>
        <Text style={styles.avatarText}>{item.first_name[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.listTitle}>{item.first_name} {item.last_name}</Text>
        <Text style={styles.listSub}>{item.role.toUpperCase()} • {item.store_name || "No Store"}</Text>
      </View>
      <TouchableOpacity 
        style={[styles.statusBtn, { backgroundColor: item.status === 'active' ? '#DEF7EC' : '#FDE8E8' }]}
        onPress={() => toggleUserStatus(item.id, item.status, item.role)}
      >
        <Text style={[styles.statusText, { color: item.status === 'active' ? COLORS.success : COLORS.danger }]}>
          {item.status.toUpperCase()}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderLogItem = ({ item }) => {
    let iconName = "pencil";
    let iconColor = COLORS.primary;
    if (item.action_type === 'INSERT') { iconName = "add-circle"; iconColor = COLORS.success; }
    else if (item.action_type === 'DELETE') { iconName = "trash"; iconColor = COLORS.danger; }

    return (
      <View style={styles.logItem}>
        <Ionicons name={iconName} size={20} color={iconColor} style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.logDesc}>{item.description}</Text>
          <View style={styles.logMetaRow}>
            <Text style={styles.logMeta}>{item.store_name || "System"}</Text>
            <Text style={styles.logMeta}>•</Text>
            <Text style={styles.logMeta}>{new Date(item.created_at).toLocaleString()}</Text>
          </View>
        </View>
      </View>
    );
  };

  // --- HEADER TITLE SWITCH ---
  const getHeaderTitle = () => {
    switch(currentView) {
      case 'dashboard': return 'Global Overview';
      case 'stores': return 'Store Leaderboard';
      case 'users': return 'Manage Accounts';
      case 'logs': return 'System Audit';
      default: return 'Dashboard';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Owner Dashboard</Text>
          <Text style={styles.headerSubtitle}>{getHeaderTitle()}</Text>
        </View>
        
        {currentView !== 'dashboard' ? (
          <TouchableOpacity onPress={() => setCurrentView('dashboard')} style={styles.backBtn}>
            <Ionicons name="close" size={20} color="#FFF" />
          </TouchableOpacity>
        ) : (
          <View style={styles.ownerBadge}>
            <Ionicons name="shield-checkmark" size={14} color="#FFF" />
            <Text style={styles.ownerBadgeText}>ADMIN</Text>
          </View>
        )}
      </View>

      {/* VIEW: DASHBOARD */}
      {currentView === 'dashboard' && (
        <ScrollView 
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchGlobalData} tintColor={COLORS.primary} />}
        >
          {/* HERO */}
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Total System Revenue</Text>
            <Text style={styles.heroValue}>₱{stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
            <View style={styles.heroRow}>
              <Ionicons name="trending-up" size={16} color="#4ADE80" />
              <Text style={styles.heroSubText}> Across all stores</Text>
            </View>
          </View>

          {/* GRID */}
          <View style={styles.gridContainer}>
            {renderStatCard("Total Products", stats.totalProducts, "cube", "#3B82F6")}
            {renderStatCard("Active Staff", stats.activeMerchants, "people", "#8B5CF6")}
          </View>

          {/* ACTIONS */}
          <Text style={styles.sectionTitle}>Management</Text>
          
          <TouchableOpacity style={styles.actionBtn} onPress={() => setCurrentView('stores')}>
            <View style={[styles.actionIcon, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="stats-chart" size={24} color={COLORS.success} />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.actionTitle}>Store Analytics</Text>
              <Text style={styles.actionSub}>Revenue Leaderboard</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={() => setCurrentView('users')}>
            <View style={[styles.actionIcon, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="people" size={24} color={COLORS.primary} />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.actionTitle}>Manage Users</Text>
              <Text style={styles.actionSub}>Ban Managers & Merchants</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={() => setCurrentView('logs')}>
            <View style={[styles.actionIcon, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="list" size={24} color={COLORS.danger} />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.actionTitle}>System Audit Logs</Text>
              <Text style={styles.actionSub}>Track critical changes</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
          </TouchableOpacity>

          {/* RECENT SALES */}
          <Text style={styles.sectionTitle}>Recent Global Sales</Text>
          <View style={styles.listContainer}>
            {recentSales.map((sale) => (
              <View key={sale.id} style={styles.saleItem}>
                <View style={styles.saleIcon}><Ionicons name="receipt" size={18} color={COLORS.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.saleStore}>{sale.store_name}</Text>
                  <Text style={styles.saleDate}>{new Date(sale.created_at).toLocaleTimeString()}</Text>
                </View>
                <Text style={styles.saleAmount}>+₱{sale.total_amount}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* VIEW: STORES LEADERBOARD */}
      {currentView === 'stores' && (
        <View style={{ flex: 1 }}>
          {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{marginTop: 50}} /> : (
            <FlatList
              data={storeRankings}
              renderItem={renderStoreRankingItem}
              keyExtractor={(item) => item.name}
              contentContainerStyle={{ padding: 20 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No sales data available yet.</Text>}
            />
          )}
        </View>
      )}

      {/* VIEW: USERS */}
      {currentView === 'users' && (
        <View style={{ flex: 1 }}>
          {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{marginTop: 50}} /> : (
            <FlatList
              data={usersList}
              renderItem={renderUserItem}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 20 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No users found.</Text>}
            />
          )}
        </View>
      )}

      {/* VIEW: LOGS */}
      {currentView === 'logs' && (
        <View style={{ flex: 1 }}>
          {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{marginTop: 50}} /> : (
            <FlatList
              data={auditLogs}
              renderItem={renderLogItem}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 20 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No logs found.</Text>}
            />
          )}
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { 
    backgroundColor: COLORS.primary, padding: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20, ...COLORS.cardShadow 
  },
  headerTitle: { color: COLORS.white, fontSize: 22, fontWeight: 'bold' },
  headerSubtitle: { color: '#9CA3AF', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  ownerBadge: { flexDirection: 'row', backgroundColor: COLORS.accent, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignItems: 'center', gap: 5 },
  ownerBadgeText: { color: '#FFF', fontWeight: 'bold', fontSize: 10 },
  backBtn: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 12 },
  
  content: { padding: 20 },
  
  heroCard: { backgroundColor: COLORS.white, padding: 20, borderRadius: 16, marginBottom: 20, ...COLORS.cardShadow, borderLeftWidth: 5, borderLeftColor: COLORS.success },
  heroLabel: { color: COLORS.primary, fontSize: 14, fontWeight: '600', marginBottom: 5 },
  heroValue: { color: COLORS.text, fontSize: 32, fontWeight: 'bold' },
  heroRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  heroSubText: { color: '#6B7280', fontSize: 12 },

  gridContainer: { flexDirection: 'row', gap: 15, marginBottom: 25 },
  statCard: { flex: 1, backgroundColor: COLORS.white, padding: 15, borderRadius: 16, ...COLORS.cardShadow, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  statLabel: { color: '#6B7280', fontSize: 12 },
  statValue: { color: COLORS.primary, fontSize: 18, fontWeight: 'bold' },

  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#374151', marginBottom: 10, marginTop: 10 },
  
  // ACTIONS
  actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: 15, borderRadius: 16, marginBottom: 15, ...COLORS.cardShadow },
  actionIcon: { width: 45, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  actionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  actionSub: { fontSize: 12, color: COLORS.gray },

  // LISTS
  listContainer: { backgroundColor: COLORS.white, borderRadius: 16, padding: 10, ...COLORS.cardShadow },
  saleItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  saleIcon: { width: 32, height: 32, backgroundColor: '#EFF6FF', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  saleStore: { fontSize: 14, fontWeight: 'bold', color: COLORS.text },
  saleDate: { fontSize: 11, color: COLORS.gray },
  saleAmount: { fontSize: 14, fontWeight: 'bold', color: COLORS.success },

  // STORE RANKING ITEMS
  rankingItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: 15, marginBottom: 12, borderRadius: 16, ...COLORS.cardShadow },
  rankBadge: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  rankNumber: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  rankHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  rankName: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  rankRevenue: { fontSize: 16, fontWeight: 'bold', color: COLORS.success },
  progressBarBg: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, marginBottom: 4 },
  progressBarFill: { height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  rankSub: { fontSize: 11, color: COLORS.gray },

  // USER ITEMS
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: 15, marginBottom: 10, borderRadius: 12, ...COLORS.cardShadow },
  listAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 18 },
  listTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  listSub: { fontSize: 12, color: COLORS.gray },
  statusBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 10, fontWeight: 'bold' },

  // LOG ITEMS
  logItem: { flexDirection: 'row', padding: 15, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: COLORS.white },
  logDesc: { fontSize: 14, color: COLORS.text, marginBottom: 4 },
  logMetaRow: { flexDirection: 'row', gap: 5 },
  logMeta: { fontSize: 11, color: COLORS.gray },
  
  emptyText: { textAlign: 'center', color: COLORS.gray, marginTop: 20 }
});