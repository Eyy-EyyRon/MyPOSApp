import React, { useState, useCallback, useMemo } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  RefreshControl, StatusBar, SafeAreaView, Platform, FlatList, Alert, 
  ActivityIndicator, Modal, Image 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

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
    elevation: 4,
  }
};

export default function OwnerScreen() {
  const [currentTab, setCurrentTab] = useState('dashboard'); // 'dashboard' | 'people' | 'logs'
  const [peopleFilter, setPeopleFilter] = useState('all');   // 'all' | 'manager' | 'merchant'
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [stats, setStats] = useState({ totalRevenue: 0, totalStores: 0, totalUsers: 0 });
  const [usersList, setUsersList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [topStores, setTopStores] = useState([]);

  // Detail Modal
  const [selectedUser, setSelectedUser] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchGlobalData();
    }, [])
  );

  const fetchGlobalData = async () => {
    try {
      if (refreshing) setLoading(true);

      // 1. Global Stats
      const { data: allSales } = await supabase.from('sales').select('total_amount, store_name');
      const totalRev = (allSales || []).reduce((sum, s) => sum + s.total_amount, 0);
      
      const { count: userCount, data: users } = await supabase.from('profiles').select('*', { count: 'exact' });
      
      // 2. Store Rankings
      const storeMap = {};
      (allSales || []).forEach(sale => {
        const name = sale.store_name || "Unknown";
        if (!storeMap[name]) storeMap[name] = 0;
        storeMap[name] += sale.total_amount;
      });
      const rankings = Object.keys(storeMap)
        .map(key => ({ name: key, revenue: storeMap[key] }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5); // Top 5

      setStats({
        totalRevenue: totalRev,
        totalStores: Object.keys(storeMap).length,
        totalUsers: userCount || 0
      });
      setTopStores(rankings);
      setUsersList(users || []);

      // 3. Logs
      const { data: logs } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(20);
      setAuditLogs(logs || []);

    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchGlobalData();
  };

  // --- DRILL DOWN LOGIC ---
  const handleUserClick = async (user) => {
    setSelectedUser(user);
    setDetailModalVisible(true);
    setUserStats(null); // Reset while loading

    // Fetch specific stats based on role
    try {
      if (user.role === 'manager') {
        // Manager Stats: Inventory Value & Staff Count
        const { data: products } = await supabase.from('products').select('price, stock').eq('store_name', user.store_name);
        const invValue = (products || []).reduce((sum, p) => sum + (p.price * p.stock), 0);
        
        const { count: staffCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('store_name', user.store_name).eq('role', 'merchant');
        
        setUserStats({ type: 'manager', inventoryValue: invValue, staffCount: staffCount || 0 });

      } else if (user.role === 'merchant') {
        // Merchant Stats: Personal Sales
        const { data: sales } = await supabase.from('sales').select('total_amount').eq('store_name', user.store_name).eq('cashier_name', user.first_name); // Best effort link
        const totalSales = (sales || []).reduce((sum, s) => sum + s.total_amount, 0);
        
        setUserStats({ type: 'merchant', totalSales: totalSales, txCount: sales?.length || 0 });
      }
    } catch (e) {
      console.log(e);
    }
  };

  const toggleBanStatus = async () => {
    if (!selectedUser) return;
    const newStatus = selectedUser.status === 'active' ? 'banned' : 'active';
    
    Alert.alert(
      "Confirm Action",
      `Are you sure you want to ${newStatus === 'banned' ? 'BAN' : 'ACTIVATE'} this user?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Confirm", 
          onPress: async () => {
            await supabase.from('profiles').update({ status: newStatus }).eq('id', selectedUser.id);
            setSelectedUser(prev => ({ ...prev, status: newStatus }));
            setUsersList(prev => prev.map(u => u.id === selectedUser.id ? { ...u, status: newStatus } : u));
          }
        }
      ]
    );
  };

  // --- RENDERERS ---
  const renderUserItem = ({ item }) => {
    if (peopleFilter !== 'all' && item.role !== peopleFilter) return null;
    if (item.role === 'owner') return null; // Hide self

    const isManager = item.role === 'manager';
    return (
      <TouchableOpacity style={styles.userRow} onPress={() => handleUserClick(item)}>
        <View style={[styles.avatarBox, { backgroundColor: isManager ? '#E0E7FF' : '#FFF7ED' }]}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: isManager ? COLORS.primary : COLORS.accent }}>
            {item.first_name?.[0]}
          </Text>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <Text style={styles.rowTitle}>{item.first_name} {item.last_name}</Text>
          <Text style={styles.rowSub}>
            {item.role.toUpperCase()} • {item.store_name || "No Store"}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: item.status === 'active' ? '#DCFCE7' : '#FEE2E2' }]}>
          <Text style={[styles.statusText, { color: item.status === 'active' ? COLORS.success : COLORS.danger }]}>
            {item.status === 'active' ? 'Active' : 'Banned'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Owner Command</Text>
        <View style={styles.tabBar}>
          {['dashboard', 'people', 'logs'].map(tab => (
            <TouchableOpacity 
              key={tab} 
              style={[styles.tabBtn, currentTab === tab && styles.tabActive]} 
              onPress={() => setCurrentTab(tab)}
            >
              <Text style={[styles.tabText, currentTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.body}>
        {/* VIEW: DASHBOARD */}
        {currentTab === 'dashboard' && (
          <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>Total Revenue</Text>
              <Text style={styles.heroValue}>₱{stats.totalRevenue.toLocaleString()}</Text>
              <Text style={styles.heroSub}>Across {stats.totalStores} Active Stores</Text>
            </View>

            <Text style={styles.sectionTitle}>Top Performing Stores</Text>
            {topStores.map((store, index) => (
              <View key={index} style={styles.rankRow}>
                <View style={[styles.rankBadge, { backgroundColor: index === 0 ? '#FEF3C7' : '#F3F4F6' }]}>
                  <Text style={{ fontWeight: 'bold', color: index === 0 ? COLORS.accent : COLORS.gray }}>#{index + 1}</Text>
                </View>
                <Text style={styles.rankName}>{store.name}</Text>
                <Text style={styles.rankValue}>₱{store.revenue.toLocaleString()}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* VIEW: PEOPLE */}
        {currentTab === 'people' && (
          <View style={{ flex: 1 }}>
            <View style={styles.filterRow}>
               {['all', 'manager', 'merchant'].map(f => (
                 <TouchableOpacity key={f} onPress={() => setPeopleFilter(f)} style={[styles.filterChip, peopleFilter === f && styles.filterActive]}>
                   <Text style={[styles.filterText, peopleFilter === f && { color: '#fff' }]}>{f.toUpperCase()}</Text>
                 </TouchableOpacity>
               ))}
            </View>
            <FlatList 
              data={usersList} 
              renderItem={renderUserItem} 
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 100 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            />
          </View>
        )}

        {/* VIEW: LOGS */}
        {currentTab === 'logs' && (
          <FlatList 
            data={auditLogs}
            keyExtractor={item => item.id.toString()}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => (
              <View style={styles.logRow}>
                <Ionicons name="git-commit-outline" size={20} color={COLORS.gray} />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={styles.logDesc}>{item.description}</Text>
                  <Text style={styles.logDate}>{new Date(item.created_at).toLocaleString()}</Text>
                </View>
              </View>
            )}
          />
        )}
      </View>

      {/* MODAL: USER DETAILS */}
      <Modal visible={detailModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalAvatar}>
                <Text style={{ fontSize: 30, color: '#fff', fontWeight: 'bold' }}>{selectedUser?.first_name?.[0]}</Text>
              </View>
              <Text style={styles.modalName}>{selectedUser?.first_name} {selectedUser?.last_name}</Text>
              <Text style={styles.modalRole}>{selectedUser?.role?.toUpperCase()}</Text>
              <Text style={styles.modalStore}>{selectedUser?.store_name}</Text>
            </View>

            <View style={styles.statsGrid}>
              {userStats ? (
                userStats.type === 'manager' ? (
                  <>
                    <View style={styles.statBox}>
                      <Text style={styles.statLabel}>Inventory Value</Text>
                      <Text style={styles.statNum}>₱{userStats.inventoryValue.toLocaleString()}</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statLabel}>Staff Count</Text>
                      <Text style={styles.statNum}>{userStats.staffCount}</Text>
                    </View>
                  </>
                ) : (
                   <>
                    <View style={styles.statBox}>
                      <Text style={styles.statLabel}>Total Sales</Text>
                      <Text style={styles.statNum}>₱{userStats.totalSales.toLocaleString()}</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statLabel}>Transactions</Text>
                      <Text style={styles.statNum}>{userStats.txCount}</Text>
                    </View>
                  </>
                )
              ) : (
                <ActivityIndicator color={COLORS.primary} style={{ margin: 20 }} />
              )}
            </View>

            <TouchableOpacity 
               style={[styles.banBtn, { backgroundColor: selectedUser?.status === 'active' ? '#FEF2F2' : '#ECFDF5' }]} 
               onPress={toggleBanStatus}
            >
               <Text style={[styles.banText, { color: selectedUser?.status === 'active' ? COLORS.danger : COLORS.success }]}>
                 {selectedUser?.status === 'active' ? "BAN USER" : "ACTIVATE USER"}
               </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setDetailModalVisible(false)}>
              <Text style={{ color: COLORS.gray }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  
  // HEADER
  header: { backgroundColor: COLORS.primary, padding: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, zIndex: 10 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 15 },
  tabBar: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#fff' },
  tabText: { color: 'rgba(255,255,255,0.6)', fontWeight: '600', fontSize: 12 },
  tabTextActive: { color: COLORS.primary, fontWeight: 'bold' },

  body: { flex: 1, padding: 20 },

  // DASHBOARD
  heroCard: { backgroundColor: COLORS.primary, padding: 25, borderRadius: 20, marginBottom: 25, alignItems: 'center', ...COLORS.cardShadow },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
  heroValue: { color: '#fff', fontSize: 36, fontWeight: 'bold', marginVertical: 5 },
  heroSub: { color: COLORS.accent, fontWeight: 'bold' },

  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 15 },
  rankRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, ...COLORS.cardShadow },
  rankBadge: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  rankName: { flex: 1, fontSize: 16, fontWeight: '600', color: COLORS.text },
  rankValue: { fontSize: 16, fontWeight: 'bold', color: COLORS.success },

  // PEOPLE LIST
  filterRow: { flexDirection: 'row', marginBottom: 15, gap: 10 },
  filterChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E5E7EB' },
  filterActive: { backgroundColor: COLORS.primary },
  filterText: { fontSize: 12, fontWeight: 'bold', color: COLORS.text },

  userRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 10, ...COLORS.cardShadow },
  avatarBox: { width: 45, height: 45, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  rowTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.gray },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: 'bold' },

  // LOGS
  logRow: { flexDirection: 'row', padding: 15, backgroundColor: '#fff', marginBottom: 1, borderBottomWidth: 1, borderColor: '#F3F4F6' },
  logDesc: { fontSize: 14, color: COLORS.text },
  logDate: { fontSize: 11, color: COLORS.gray, marginTop: 4 },

  // MODAL
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', width: '100%', maxWidth: 340, borderRadius: 24, padding: 25 },
  modalHeader: { alignItems: 'center', marginBottom: 20 },
  modalAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 10, ...COLORS.cardShadow },
  modalName: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  modalRole: { fontSize: 12, fontWeight: 'bold', color: COLORS.gray, marginTop: 2 },
  modalStore: { fontSize: 16, color: COLORS.primary, fontWeight: '600', marginTop: 5 },

  statsGrid: { flexDirection: 'row', gap: 15, marginBottom: 25 },
  statBox: { flex: 1, backgroundColor: '#F9FAFB', padding: 15, borderRadius: 12, alignItems: 'center' },
  statLabel: { fontSize: 12, color: COLORS.gray, marginBottom: 5 },
  statNum: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },

  banBtn: { width: '100%', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  banText: { fontWeight: 'bold' },
  closeBtn: { alignItems: 'center', padding: 10 },
});