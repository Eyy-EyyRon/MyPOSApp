import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  RefreshControl, StatusBar, SafeAreaView, Platform, FlatList, Alert, 
  ActivityIndicator, Modal, Animated, Dimensions, TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

// --- THEME ---
const COLORS = {
  primary: '#1E1B4B', 
  secondary: '#312E81', 
  accent: '#F59E0B',  
  success: '#10B981', 
  danger: '#EF4444', 
  warning: '#F59E0B',
  bg: '#F3F4F6',
  white: '#FFFFFF',
  text: '#1F2937',
  gray: '#9CA3AF',
  cardShadow: {
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  }
};

const SCREEN_WIDTH = Dimensions.get('window').width;

// 💰 PAYROLL SETTINGS (Est. Monthly Salary)
const PAYROLL_RATES = {
    manager: 25000, 
    merchant: 15000
};

export default function OwnerScreen() {
  const [currentTab, setCurrentTab] = useState('dashboard'); 
  const [peopleFilter, setPeopleFilter] = useState('all');   
  const [dashboardRange, setDashboardRange] = useState('today');

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [stats, setStats] = useState({ 
    totalRevenue: 0, totalStores: 0, totalStaff: 0, 
    estimatedProfit: 0, cogs: 0, laborCost: 0 
  });
  
  const [usersList, setUsersList] = useState([]);
  const [payrollData, setPayrollData] = useState({ managers: 0, merchants: 0, totalCost: 0 });
  const [auditLogs, setAuditLogs] = useState([]);
  const [topStores, setTopStores] = useState([]);

  // Detail Modal
  const [selectedUser, setSelectedUser] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // 📢 Announcement Modal
  const [broadcastVisible, setBroadcastVisible] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');

  useFocusEffect(
    useCallback(() => {
      fetchGlobalData();
    }, [dashboardRange]) 
  );

  const fetchGlobalData = async () => {
    try {
      if (refreshing) setLoading(true);

      // 1. DATE FILTER LOGIC
      let dateQuery = supabase.from('sales').select('total_amount, store_name, sale_date');
      const now = new Date();
      if (dashboardRange === 'today') {
        const startOfDay = new Date(now.setHours(0,0,0,0)).toISOString();
        dateQuery = dateQuery.gte('sale_date', startOfDay);
      } else if (dashboardRange === 'week') {
        const firstDay = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
        dateQuery = dateQuery.gte('sale_date', firstDay);
      }

      // 2. FETCH SALES
      const { data: salesData, error } = await dateQuery;
      if (error) throw error;
      const totalRev = (salesData || []).reduce((sum, s) => sum + s.total_amount, 0);

      // 3. FETCH STAFF & STORES
      const { data: users } = await supabase.from('profiles').select('*');
      const activeStaff = users.filter(u => u.status === 'active' && u.role !== 'owner');
      
      // 4. CALCULATE PAYROLL (Global Staff Management)
      const mgrCount = activeStaff.filter(u => u.role === 'manager').length;
      const merchCount = activeStaff.filter(u => u.role === 'merchant').length;
      const monthlyPayroll = (mgrCount * PAYROLL_RATES.manager) + (merchCount * PAYROLL_RATES.merchant);
      setPayrollData({ managers: mgrCount, merchants: merchCount, totalCost: monthlyPayroll });

      // 5. CALCULATE PROFIT
      const COGS_PERCENTAGE = 0.70; 
      const estimatedCOGS = totalRev * COGS_PERCENTAGE;
      // Convert monthly payroll to daily estimate for the "Today" view
      const dailyLabor = monthlyPayroll / 30; 
      const actualLaborCost = dashboardRange === 'today' ? dailyLabor : (dailyLabor * 7); // Rough estimate
      
      const estimatedProfit = totalRev - estimatedCOGS - actualLaborCost;

      // 6. STORE RANKINGS
      const storeMap = {};
      (salesData || []).forEach(sale => {
        const name = sale.store_name || "Unknown";
        if (!storeMap[name]) storeMap[name] = 0;
        storeMap[name] += sale.total_amount;
      });
      const rankings = Object.keys(storeMap)
        .map(key => ({ name: key, revenue: storeMap[key] }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5); 

      setStats({
        totalRevenue: totalRev,
        totalStores: Object.keys(storeMap).length,
        totalStaff: activeStaff.length,
        estimatedProfit: estimatedProfit,
        cogs: estimatedCOGS,
        laborCost: actualLaborCost
      });

      setTopStores(rankings);
      setUsersList(users || []);

      // 7. 🛡️ AUDIT LOGS
      const { data: logs } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(30);
      setAuditLogs(logs || []);

    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); fetchGlobalData(); };

  // --- 📢 BROADCAST LOGIC ---
  const handleSendBroadcast = async () => {
      if (!broadcastMessage.trim()) return Alert.alert("Empty", "Please type a message.");
      
      try {
          setLoading(true);
          const { error } = await supabase.from('announcements').insert([{
              message: broadcastMessage,
              is_active: true
          }]);

          if (error) throw error;

          Alert.alert("Sent!", "Announcement has been broadcasted to all staff.");
          setBroadcastMessage('');
          setBroadcastVisible(false);
      } catch (e) {
          Alert.alert("Error", e.message);
      } finally {
          setLoading(false);
      }
  };

  // --- ACTIONS ---
  const handleUserClick = async (user) => {
    setSelectedUser(user);
    setDetailModalVisible(true);
    setUserStats(null); 
  };

  const toggleBanStatus = async () => {
    if (!selectedUser) return;
    const newStatus = selectedUser.status === 'active' ? 'banned' : 'active';
    await supabase.from('profiles').update({ status: newStatus }).eq('id', selectedUser.id);
    setSelectedUser(prev => ({ ...prev, status: newStatus }));
    setUsersList(prev => prev.map(u => u.id === selectedUser.id ? { ...u, status: newStatus } : u));
  };

  // --- RENDERERS ---
  const renderUserItem = ({ item }) => {
    if (peopleFilter !== 'all' && item.role !== peopleFilter) return null;
    if (item.role === 'owner') return null; 
    const isManager = item.role === 'manager';
    return (
      <TouchableOpacity style={styles.userRow} onPress={() => handleUserClick(item)}>
        <View style={[styles.avatarBox, { backgroundColor: isManager ? '#E0E7FF' : '#FFF7ED' }]}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: isManager ? COLORS.primary : COLORS.accent }}>{item.first_name?.[0]}</Text>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <Text style={styles.rowTitle}>{item.first_name} {item.last_name}</Text>
          <Text style={styles.rowSub}>{item.role.toUpperCase()} • {item.store_name || "No Store"}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: item.status === 'active' ? '#DCFCE7' : '#FEE2E2' }]}>
          <Text style={[styles.statusText, { color: item.status === 'active' ? COLORS.success : COLORS.danger }]}>{item.status === 'active' ? 'Active' : 'Banned'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // --- 🛡️ LOG RENDERER (Smart Highlighting) ---
  const renderLogItem = ({ item }) => {
      // Detect suspicious keywords
      const desc = item.description.toLowerCase();
      const isCritical = desc.includes('delete') || desc.includes('refund') || desc.includes('banned');
      const isWarning = desc.includes('edit') || desc.includes('stock');

      let icon = "git-commit-outline";
      let iconColor = COLORS.gray;
      let bgColor = "#fff";

      if (isCritical) {
          icon = "alert-circle";
          iconColor = COLORS.danger;
          bgColor = "#FEF2F2"; // Light Red
      } else if (isWarning) {
          icon = "create-outline";
          iconColor = COLORS.warning;
      }

      return (
        <View style={[styles.logRow, { backgroundColor: bgColor }]}>
            <View style={{width: 30, alignItems:'center'}}>
                <Ionicons name={icon} size={20} color={iconColor} />
            </View>
            <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={[styles.logDesc, isCritical && {color: COLORS.danger, fontWeight:'bold'}]}>{item.description}</Text>
                <Text style={styles.logDate}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
        </View>
      );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
            <Text style={styles.headerTitle}>Owner Command</Text>
            {/* 📢 BROADCAST BUTTON */}
            <TouchableOpacity style={styles.broadcastBtn} onPress={() => setBroadcastVisible(true)}>
                <Ionicons name="megaphone" size={20} color="#fff" />
            </TouchableOpacity>
        </View>
        <View style={styles.tabBar}>
          {['dashboard', 'people', 'logs'].map(tab => (
            <TouchableOpacity key={tab} style={[styles.tabBtn, currentTab === tab && styles.tabActive]} onPress={() => setCurrentTab(tab)}>
              <Text style={[styles.tabText, currentTab === tab && styles.tabTextActive]}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.body}>
        {/* VIEW: DASHBOARD */}
        {currentTab === 'dashboard' && (
          <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
            {/* DATE TOGGLE */}
            <View style={styles.dateToggleContainer}>
                {['today', 'week', 'all'].map(range => (
                    <TouchableOpacity key={range} style={[styles.dateToggleBtn, dashboardRange === range && { backgroundColor: COLORS.white, ...COLORS.cardShadow }]} onPress={() => setDashboardRange(range)}>
                        <Text style={[styles.dateToggleText, dashboardRange === range && { color: COLORS.primary, fontWeight:'bold' }]}>{range.toUpperCase()}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* REVENUE CARD */}
            <View style={styles.heroCard}>
              <View style={styles.heroRow}>
                  <View><Text style={styles.heroLabel}>TOTAL REVENUE</Text><Text style={styles.heroValue}>₱{stats.totalRevenue.toLocaleString()}</Text></View>
                  <View style={styles.heroIconCircle}><Ionicons name="trending-up" size={28} color="#fff" /></View>
              </View>
              <View style={styles.heroFooter}>
                  <Text style={styles.heroSub}>{stats.totalStores} Active Stores</Text>
                  <Text style={styles.heroSub}>{stats.totalStaff} Active Staff</Text>
              </View>
            </View>

            {/* PROFIT ESTIMATOR */}
            <View style={styles.profitCard}>
                <Text style={styles.sectionTitleSmall}>PROFIT ESTIMATOR</Text>
                <View style={styles.calcRow}><Text style={styles.calcLabel}>Gross Sales</Text><Text style={styles.calcValue}>₱{stats.totalRevenue.toLocaleString()}</Text></View>
                <View style={styles.calcRow}><Text style={styles.calcLabel}>Cost of Goods (70%)</Text><Text style={[styles.calcValue, {color: COLORS.danger}]}>- ₱{stats.cogs.toLocaleString()}</Text></View>
                <View style={styles.calcRow}><Text style={styles.calcLabel}>Labor Cost (Est.)</Text><Text style={[styles.calcValue, {color: COLORS.danger}]}>- ₱{stats.laborCost.toLocaleString()}</Text></View>
                <View style={styles.divider} />
                <View style={styles.calcRow}><Text style={[styles.calcLabel, {fontWeight:'bold', color: COLORS.primary}]}>NET PROFIT</Text><Text style={[styles.calcValue, {fontWeight:'bold', color: stats.estimatedProfit >= 0 ? COLORS.success : COLORS.danger, fontSize: 18}]}>₱{stats.estimatedProfit.toLocaleString()}</Text></View>
            </View>

            {/* LEADERBOARD */}
            <Text style={styles.sectionTitle}>Store Rankings</Text>
            {topStores.map((store, index) => (
                <View key={index} style={styles.rankRow}>
                    <View style={styles.rankInfo}>
                        <View style={[styles.rankBadge, { backgroundColor: index === 0 ? '#FEF3C7' : '#F3F4F6' }]}><Text style={{ fontWeight: 'bold', color: index === 0 ? COLORS.accent : COLORS.gray }}>#{index + 1}</Text></View>
                        <Text style={styles.rankName}>{store.name}</Text>
                        <Text style={styles.rankValue}>₱{store.revenue.toLocaleString()}</Text>
                    </View>
                    <View style={styles.barContainer}><View style={[styles.barFill, { width: `${(store.revenue / (topStores[0]?.revenue || 1)) * 100}%`, backgroundColor: index === 0 ? COLORS.success : COLORS.primary }]} /></View>
                </View>
            ))}
            <View style={{height: 40}} />
          </ScrollView>
        )}

        {/* VIEW: PEOPLE */}
        {currentTab === 'people' && (
          <View style={{ flex: 1 }}>
            {/* 👥 PAYROLL SUMMARY CARD */}
            <View style={styles.payrollCard}>
                <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:10}}>
                    <Text style={styles.payrollTitle}>Monthly Payroll Est.</Text>
                    <Ionicons name="people" size={20} color={COLORS.primary} />
                </View>
                <Text style={styles.payrollBig}>₱{payrollData.totalCost.toLocaleString()}</Text>
                <Text style={styles.payrollSub}>{payrollData.managers} Managers • {payrollData.merchants} Merchants</Text>
            </View>

            <View style={styles.filterRow}>
               {['all', 'manager', 'merchant'].map(f => (
                 <TouchableOpacity key={f} onPress={() => setPeopleFilter(f)} style={[styles.filterChip, peopleFilter === f && styles.filterActive]}><Text style={[styles.filterText, peopleFilter === f && { color: '#fff' }]}>{f.toUpperCase()}</Text></TouchableOpacity>
               ))}
            </View>
            <FlatList data={usersList} renderItem={renderUserItem} keyExtractor={item => item.id} contentContainerStyle={{ paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} />
          </View>
        )}

        {/* VIEW: LOGS */}
        {currentTab === 'logs' && (
          <FlatList data={auditLogs} keyExtractor={item => item.id.toString()} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} renderItem={renderLogItem} />
        )}
      </View>

      {/* MODAL: USER DETAILS */}
      <Modal visible={detailModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalAvatar}><Text style={{ fontSize: 30, color: '#fff', fontWeight: 'bold' }}>{selectedUser?.first_name?.[0]}</Text></View>
              <Text style={styles.modalName}>{selectedUser?.first_name} {selectedUser?.last_name}</Text>
              <Text style={styles.modalRole}>{selectedUser?.role?.toUpperCase()}</Text>
              <Text style={styles.modalStore}>{selectedUser?.store_name}</Text>
            </View>
            <TouchableOpacity style={[styles.banBtn, { backgroundColor: selectedUser?.status === 'active' ? '#FEF2F2' : '#ECFDF5' }]} onPress={toggleBanStatus}>
               <Text style={[styles.banText, { color: selectedUser?.status === 'active' ? COLORS.danger : COLORS.success }]}>{selectedUser?.status === 'active' ? "BAN USER" : "ACTIVATE USER"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setDetailModalVisible(false)}><Text style={{ color: COLORS.gray }}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 📢 MODAL: BROADCAST */}
      <Modal visible={broadcastVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
                <View style={{alignItems:'center', marginBottom:20}}>
                    <View style={[styles.heroIconCircle, {backgroundColor: COLORS.accent, marginBottom:10}]}><Ionicons name="megaphone" size={30} color="#fff"/></View>
                    <Text style={styles.modalName}>Staff Announcement</Text>
                    <Text style={{textAlign:'center', color:COLORS.gray, marginTop:5}}>Send a notification to all active Managers and Merchants.</Text>
                </View>
                <TextInput 
                    style={styles.broadcastInput} 
                    placeholder="Type your message here..." 
                    multiline 
                    numberOfLines={4} 
                    value={broadcastMessage}
                    onChangeText={setBroadcastMessage}
                />
                <TouchableOpacity style={[styles.banBtn, {backgroundColor: COLORS.primary}]} onPress={handleSendBroadcast}>
                    <Text style={[styles.banText, {color: '#fff'}]}>SEND BROADCAST</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setBroadcastVisible(false)}><Text style={{ color: COLORS.gray }}>Cancel</Text></TouchableOpacity>
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
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  broadcastBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  tabBar: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#fff' },
  tabText: { color: 'rgba(255,255,255,0.6)', fontWeight: '600', fontSize: 12 },
  tabTextActive: { color: COLORS.primary, fontWeight: 'bold' },

  body: { flex: 1, padding: 20 },

  // DATE TOGGLE
  dateToggleContainer: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 12, padding: 4, marginBottom: 20 },
  dateToggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  dateToggleText: { fontSize: 12, fontWeight: '600', color: COLORS.gray },

  // DASHBOARD CARDS
  heroCard: { backgroundColor: COLORS.primary, padding: 20, borderRadius: 20, marginBottom: 15, ...COLORS.cardShadow },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight:'bold', letterSpacing: 1, marginBottom: 5 },
  heroValue: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
  heroIconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  heroFooter: { flexDirection: 'row', gap: 15, marginTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 10 },
  heroSub: { color: COLORS.accent, fontWeight: 'bold', fontSize: 12 },

  profitCard: { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 25, ...COLORS.cardShadow },
  sectionTitleSmall: { fontSize: 14, fontWeight: 'bold', color: COLORS.gray, marginBottom: 15, letterSpacing:1 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  calcLabel: { fontSize: 14, color: COLORS.text },
  calcValue: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 10 },

  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 15 },
  rankRow: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, ...COLORS.cardShadow },
  rankInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  rankBadge: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  rankName: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
  rankValue: { fontSize: 15, fontWeight: 'bold', color: COLORS.success },
  barContainer: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },

  // PEOPLE LIST
  payrollCard: { backgroundColor: '#fff', padding: 20, borderRadius: 20, marginBottom: 20, borderLeftWidth: 5, borderLeftColor: COLORS.primary, ...COLORS.cardShadow },
  payrollTitle: { fontSize: 14, color: COLORS.gray, fontWeight: '600' },
  payrollBig: { fontSize: 28, fontWeight: 'bold', color: COLORS.text, marginVertical: 5 },
  payrollSub: { fontSize: 12, color: COLORS.gray },

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
  logRow: { flexDirection: 'row', padding: 15, backgroundColor: '#fff', marginBottom: 1, borderBottomWidth: 1, borderColor: '#F3F4F6', alignItems:'center' },
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
  banBtn: { width: '100%', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  banText: { fontWeight: 'bold' },
  closeBtn: { alignItems: 'center', padding: 10 },
  
  broadcastInput: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 15, height: 120, textAlignVertical:'top', marginBottom: 20, fontSize: 16 },
});