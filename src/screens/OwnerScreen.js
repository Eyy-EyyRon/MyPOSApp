import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, StatusBar, SafeAreaView, Platform, FlatList, Alert,
  ActivityIndicator, Modal, KeyboardAvoidingView, Dimensions, TextInput,
  Image, Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  // Base
  bg:        '#0C0E1A',   // Very dark navy background
  surface:   '#141728',   // Card surfaces
  surfaceUp: '#1C2038',   // Elevated surface
  border:    '#252A45',   // Subtle borders
  // Brand
  navy:      '#130F5F',
  indigo:    '#1E1B4B',
  indigoMid: '#312E81',
  // Accent
  gold:      '#F59E0B',
  goldDim:   '#78490A',
  // Semantic
  success:   '#10B981',
  successBg: '#052E1F',
  danger:    '#EF4444',
  dangerBg:  '#2D0E0E',
  warning:   '#F59E0B',
  warnBg:    '#2D1E00',
  info:      '#3B82F6',
  infoBg:    '#0D1F3C',
  // Text
  textPrimary:   '#F0F2FF',
  textSecondary: '#8892B0',
  textMuted:     '#4A5270',
  white:         '#FFFFFF',
  // Shadows
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
};

const TABS = [
  { id: 'stores',    label: 'Sales',      icon: 'bar-chart',     iconActive: 'bar-chart' },
  { id: 'people',    label: 'Staff',      icon: 'people-outline', iconActive: 'people' },
  { id: 'inventory', label: 'Inventory',  icon: 'cube-outline',   iconActive: 'cube' },
  { id: 'alerts',    label: 'Alerts',     icon: 'warning-outline', iconActive: 'warning' },
];

// ─── CONFIRMATION MODAL ───────────────────────────────────────────────────────
const ConfirmModal = ({ visible, title, message, confirmLabel, confirmColor = C.danger, onConfirm, onCancel, loading }) => {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View style={[styles.confirmOverlay, { opacity: opacityAnim }]}>
        <Animated.View style={[styles.confirmCard, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[styles.confirmIconRing, { backgroundColor: confirmColor + '22', borderColor: confirmColor + '44' }]}>
            <Ionicons name={confirmColor === C.danger ? 'warning' : 'checkmark-circle'} size={32} color={confirmColor} />
          </View>
          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmMessage}>{message}</Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity style={styles.confirmCancelBtn} onPress={onCancel} disabled={loading}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmActionBtn, { backgroundColor: confirmColor }]}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.confirmActionText}>{confirmLabel}</Text>
              }
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

// ─── STAT PILL ────────────────────────────────────────────────────────────────
const StatPill = ({ label, value, color, icon }) => (
  <View style={[styles.statPill, { borderColor: color + '33', backgroundColor: color + '11' }]}>
    <Ionicons name={icon} size={14} color={color} style={{ marginBottom: 4 }} />
    <Text style={[styles.statPillVal, { color }]}>{value}</Text>
    <Text style={styles.statPillLabel}>{label}</Text>
  </View>
);

// ─── SECTION HEADER ───────────────────────────────────────────────────────────
const SectionHeader = ({ label }) => (
  <View style={styles.sectionHeaderRow}>
    <View style={styles.sectionHeaderDot} />
    <Text style={styles.sectionHeaderText}>{label}</Text>
    <View style={styles.sectionHeaderLine} />
  </View>
);

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function OwnerScreen() {
  const [currentTab, setCurrentTab] = useState('stores');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [peopleFilter, setPeopleFilter] = useState('all');
  const [dashboardRange, setDashboardRange] = useState('today');
  const [inventoryStoreFilter, setInventoryStoreFilter] = useState('All');

  const [storeData, setStoreData] = useState([]);
  const [globalStats, setGlobalStats] = useState({ totalRev: 0, totalItems: 0 });
  const [users, setUsers] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [flags, setFlags] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [uniqueStoreNames, setUniqueStoreNames] = useState([]);
  const [expandedStore, setExpandedStore] = useState(null);

  const [globalDeduction, setGlobalDeduction] = useState('15');
  const [customRates, setCustomRates] = useState({});

  // Modals
  const [broadcastVisible, setBroadcastVisible] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastTarget, setBroadcastTarget] = useState('ALL');
  const [broadcastType, setBroadcastType] = useState('info');

  const [selectedUser, setSelectedUser] = useState(null);
  const [userModalVisible, setUserModalVisible] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productActionModal, setProductActionModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');

  const [unifiedModalVisible, setUnifiedModalVisible] = useState(false);
  const [selectedMerchantsForUnified, setSelectedMerchantsForUnified] = useState([]);
  const [selectedStoresForUnified, setSelectedStoresForUnified] = useState([]);

  // Confirmation modals
  const [confirmConfig, setConfirmConfig] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Tab indicator animation
  const tabIndicatorX = useRef(new Animated.Value(0)).current;
  const tabWidth = (width - 40) / TABS.length;

  // Store card expand animation map
  const expandAnims = useRef({}).current;

  useFocusEffect(useCallback(() => { fetchData(); }, [dashboardRange]));

  const switchTab = (tabId) => {
    const idx = TABS.findIndex(t => t.id === tabId);
    Animated.spring(tabIndicatorX, {
      toValue: idx * tabWidth,
      tension: 100, friction: 12,
      useNativeDriver: true,
    }).start();
    setCurrentTab(tabId);
    Haptics.selectionAsync();
  };

  const getExpandAnim = (storeName) => {
    if (!expandAnims[storeName]) {
      expandAnims[storeName] = new Animated.Value(0);
    }
    return expandAnims[storeName];
  };

  const toggleStore = (storeName) => {
    const anim = getExpandAnim(storeName);
    const isExpanded = expandedStore === storeName;
    Haptics.selectionAsync();
    Animated.timing(anim, {
      toValue: isExpanded ? 0 : 1,
      duration: 250,
      useNativeDriver: false,
    }).start();
    setExpandedStore(isExpanded ? null : storeName);
  };

  const showConfirm = (config) => setConfirmConfig(config);
  const hideConfirm = () => { setConfirmConfig(null); setConfirmLoading(false); };

  // ── FETCH ──────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      if (refreshing) setLoading(true);
      const now = new Date();
      let startDate = null;
      if (dashboardRange === 'today') startDate = new Date(now.setHours(0,0,0,0)).toISOString();
      else if (dashboardRange === 'week') startDate = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();

      let salesQuery = supabase.from('sales').select(`id, store_name, total_amount, sale_date, sales_items(quantity, unit_price, product_id)`);
      if (startDate) salesQuery = salesQuery.gte('sale_date', startDate);
      const { data: sales } = await salesQuery;

      const { data: products } = await supabase.from('products').select('*').order('name');
      const { data: profiles } = await supabase.from('profiles').select('*').neq('role', 'owner');
      const { data: systemFlags } = await supabase.from('system_flags').select('*, profiles(first_name, last_name)').eq('status', 'active').order('created_at', { ascending: false });
      const { data: logs } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);

      let sMap = {}, gRev = 0, gItems = 0, stores = new Set();
      const prodMap = {};
      products?.forEach(p => prodMap[p.id] = p);

      sales?.forEach(sale => {
        const sName = sale.store_name || 'Unassigned';
        stores.add(sName);
        if (!sMap[sName]) sMap[sName] = { name: sName, revenue: 0, itemsSold: 0, products: {}, zeroSales: [] };
        gRev += sale.total_amount;
        sMap[sName].revenue += sale.total_amount;
        sale.sales_items?.forEach(item => {
          const pDetails = prodMap[item.product_id];
          const pName = pDetails ? pDetails.name : 'Unknown Product';
          if (!sMap[sName].products[pName]) sMap[sName].products[pName] = { name: pName, qty: 0, price: item.unit_price, total: 0 };
          sMap[sName].products[pName].qty += item.quantity;
          sMap[sName].products[pName].total += (item.quantity * item.unit_price);
          sMap[sName].itemsSold += item.quantity;
          gItems += item.quantity;
        });
      });

      products?.forEach(p => {
        if (p.store_name) { stores.add(p.store_name); }
        if (p.store_name && sMap[p.store_name] && !sMap[p.store_name].products[p.name]) {
          sMap[p.store_name].zeroSales.push(p.name);
        }
      });

      setStoreData(Object.values(sMap).sort((a, b) => b.revenue - a.revenue));
      setGlobalStats({ totalRev: gRev, totalItems: gItems });
      setUsers(profiles || []);
      setFlags(systemFlags || []);
      setAuditLogs(logs || []);
      setAllProducts(products || []);
      setUniqueStoreNames([...stores]);
      generateAutoFlags(products, logs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const generateAutoFlags = async (products, logs) => {
    const orphaned = products?.filter(p => !p.store_name || p.store_name.trim() === '');
    for (const p of (orphaned || [])) {
      const { data: existing } = await supabase.from('system_flags').select('id').eq('title', 'Unregistered Product Added').eq('description', `Product: ${p.name}`).single();
      if (!existing) await supabase.from('system_flags').insert([{ type: 'unregistered_product', title: 'Unregistered Product Added', description: `Product: ${p.name} has no store assigned.`, status: 'active' }]);
    }
    const suspiciousLogs = logs?.filter(l => l.description.toLowerCase().includes('stock updated manually') || l.description.toLowerCase().includes('override'));
    for (const l of (suspiciousLogs || [])) {
      const { data: existing } = await supabase.from('system_flags').select('id').eq('description', l.description).single();
      if (!existing) await supabase.from('system_flags').insert([{ user_id: l.user_id, store_name: l.store_name, type: 'unauthorized_stock', title: 'Unauthorized Stock Update', description: l.description, status: 'active' }]);
    }
    if (orphaned?.length > 0 || suspiciousLogs?.length > 0) {
      const { data } = await supabase.from('system_flags').select('*, profiles(first_name, last_name)').eq('status', 'active').order('created_at', { ascending: false });
      setFlags(data || []);
    }
  };

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // ── ACTIONS ────────────────────────────────────────────────────────────────
  const handleSendBroadcast = async () => {
    if (!broadcastMsg.trim()) return Alert.alert('Required', 'Message cannot be empty.');
    setLoading(true);
    try {
      await supabase.from('announcements').insert([{ message: broadcastMsg, target_store: broadcastTarget, type: broadcastType, is_active: true }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sent ✓', 'Announcement broadcasted.');
      setBroadcastVisible(false); setBroadcastMsg('');
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  };

  const handleFlagAction = async (flagId, action, userId = null) => {
    setConfirmLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (action === 'dismiss') {
        await supabase.from('system_flags').update({ status: 'dismissed' }).eq('id', flagId);
      } else if (action === 'warn' && userId) {
        const user = users.find(u => u.id === userId);
        await supabase.from('profiles').update({ violations_count: (user?.violations_count || 0) + 1 }).eq('id', userId);
        await supabase.from('system_flags').update({ status: 'escalated' }).eq('id', flagId);
      } else if (action === 'suspend' && userId) {
        await supabase.from('profiles').update({ status: 'banned' }).eq('id', userId);
        await supabase.from('system_flags').update({ status: 'escalated' }).eq('id', flagId);
      }
      fetchData();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { hideConfirm(); }
  };

  const toggleUserBan = async () => {
    const newStatus = selectedUser.status === 'active' ? 'banned' : 'active';
    setConfirmLoading(true);
    try {
      await supabase.from('profiles').update({ status: newStatus }).eq('id', selectedUser.id);
      setUserModalVisible(false);
      fetchData();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { hideConfirm(); }
  };

  const handleDisableProduct = async () => {
    if (!flagReason.trim()) return;
    setConfirmLoading(true);
    try {
      await supabase.from('products').update({ is_active: false }).eq('id', selectedProduct.id);
      await supabase.from('system_flags').insert([{ type: 'admin_action', store_name: selectedProduct.store_name, title: 'Product Disabled by Owner', description: `Product: ${selectedProduct.name}. Reason: ${flagReason}`, status: 'active' }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProductActionModal(false); setFlagReason('');
      fetchData();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { hideConfirm(); }
  };

  const handleRestoreProduct = async () => {
    setConfirmLoading(true);
    try {
      await supabase.from('products').update({ is_active: true }).eq('id', selectedProduct.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProductActionModal(false); fetchData();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { hideConfirm(); }
  };

  const handleSendUnifiedInvites = async () => {
    if (selectedMerchantsForUnified.length === 0 || selectedStoresForUnified.length === 0) return;
    setLoading(true);
    try {
      const inserts = [];
      const allManagers = users.filter(u => u.role === 'manager');
      for (const merchId of selectedMerchantsForUnified) {
        for (const storeId of selectedStoresForUnified) {
          const storeObj = allManagers.find(s => s.id === storeId);
          if (storeObj) inserts.push({ merchant_id: merchId, manager_id: storeId, store_name: storeObj.store_name, status: 'invited' });
        }
      }
      const { error } = await supabase.from('store_applications').insert(inserts);
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Invites Sent ✓', `${inserts.length} shift invitation(s) dispatched.`);
      setUnifiedModalVisible(false);
      setSelectedMerchantsForUnified([]); setSelectedStoresForUnified([]);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  };

  const toggleMerchantSelection = (id) => {
    Haptics.selectionAsync();
    setSelectedMerchantsForUnified(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };
  const toggleStoreSelection = (id) => {
    Haptics.selectionAsync();
    setSelectedStoresForUnified(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // ── RENDERERS ──────────────────────────────────────────────────────────────

  const renderStoreAnalytics = () => (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} />}
      contentContainerStyle={{ paddingBottom: 110 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Range Selector */}
      <View style={styles.rangeRow}>
        {['today', 'week', 'all'].map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.rangeBtn, dashboardRange === r && styles.rangeBtnActive]}
            onPress={() => setDashboardRange(r)}
          >
            <Text style={[styles.rangeBtnText, dashboardRange === r && styles.rangeBtnTextActive]}>
              {r === 'all' ? 'All Time' : r.charAt(0).toUpperCase() + r.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Global Hero Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroBadge}>
            <Ionicons name="globe-outline" size={16} color={C.gold} />
            <Text style={styles.heroBadgeText}>GLOBAL REVENUE</Text>
          </View>
          <Text style={styles.heroStoreCount}>{storeData.length} Stores</Text>
        </View>
        <Text style={styles.heroAmount}>₱{globalStats.totalRev.toLocaleString()}</Text>
        <View style={styles.heroStatRow}>
          <StatPill label="Items Sold" value={globalStats.totalItems} color={C.success} icon="cart-outline" />
          <StatPill label="Stores Active" value={storeData.length} color={C.info} icon="storefront-outline" />
          <StatPill label="Period" value={dashboardRange === 'all' ? 'All' : dashboardRange} color={C.gold} icon="time-outline" />
        </View>
      </View>

      {storeData.map((store, index) => {
        const isExpanded = expandedStore === store.name;
        const activeRate = customRates[store.name] !== undefined ? customRates[store.name] : globalDeduction;
        const parsedRate = parseFloat(activeRate) || 0;
        const deductionAmt = store.revenue * (parsedRate / 100);
        const netRev = store.revenue - deductionAmt;
        const sortedProducts = Object.values(store.products).sort((a, b) => b.qty - a.qty);
        const bestSeller = sortedProducts[0];
        const rank = index + 1;
        const rankColor = rank === 1 ? C.gold : rank === 2 ? '#94A3B8' : rank === 3 ? '#CD7F32' : C.textMuted;

        return (
          <View key={index} style={styles.storeCard}>
            <TouchableOpacity style={styles.storeCardHeader} onPress={() => toggleStore(store.name)} activeOpacity={0.8}>
              <View style={[styles.storeRankBadge, { backgroundColor: rankColor + '22', borderColor: rankColor + '55' }]}>
                <Text style={[styles.storeRank, { color: rankColor }]}>#{rank}</Text>
              </View>
              <View style={{ flex: 1, marginHorizontal: 14 }}>
                <Text style={styles.storeName}>{store.name}</Text>
                <Text style={styles.storeRevPreview}>₱{store.revenue.toLocaleString()} gross</Text>
              </View>
              <View style={styles.storeChevron}>
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={C.textSecondary} />
              </View>
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.storeExpanded}>
                {/* Commission Calculator */}
                <SectionHeader label="COMMISSION CALCULATOR" />
                <View style={styles.calcCard}>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Gross Revenue</Text>
                    <Text style={styles.calcValWhite}>₱{store.revenue.toLocaleString()}</Text>
                  </View>
                  <View style={styles.calcRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={styles.calcLabel}>Deduction</Text>
                      <View style={styles.rateBox}>
                        <TextInput
                          style={styles.rateInput}
                          keyboardType="numeric"
                          value={String(activeRate)}
                          onChangeText={val => setCustomRates({ ...customRates, [store.name]: val })}
                        />
                        <Text style={styles.rateSymbol}>%</Text>
                      </View>
                    </View>
                    <Text style={[styles.calcValWhite, { color: C.danger }]}>-₱{deductionAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                  </View>
                  <View style={styles.calcDivider} />
                  <View style={styles.calcRow}>
                    <Text style={[styles.calcLabel, { color: C.textPrimary, fontWeight: '800' }]}>Net Revenue</Text>
                    <Text style={[styles.calcValWhite, { color: C.success, fontSize: 20, fontWeight: '900' }]}>₱{netRev.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                  </View>
                </View>

                {/* Insights */}
                <SectionHeader label="ANALYTICS" />
                <View style={styles.insightsRow}>
                  {bestSeller && (
                    <View style={[styles.insightChip, { borderColor: C.success + '44', backgroundColor: C.successBg }]}>
                      <Ionicons name="trending-up" size={16} color={C.success} />
                      <Text style={[styles.insightText, { color: C.success }]}>Top: {bestSeller.name} ({bestSeller.qty})</Text>
                    </View>
                  )}
                  {store.zeroSales.length > 0 && (
                    <View style={[styles.insightChip, { borderColor: C.danger + '44', backgroundColor: C.dangerBg }]}>
                      <Ionicons name="trending-down" size={16} color={C.danger} />
                      <Text style={[styles.insightText, { color: C.danger }]}>{store.zeroSales.length} dead items</Text>
                    </View>
                  )}
                </View>

                {/* Product Table */}
                <SectionHeader label="PRODUCT BREAKDOWN" />
                <View style={styles.tableCard}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableCell, { flex: 2 }]}>PRODUCT</Text>
                    <Text style={styles.tableCell}>SOLD</Text>
                    <Text style={styles.tableCell}>PRICE</Text>
                    <Text style={[styles.tableCell, { textAlign: 'right' }]}>TOTAL</Text>
                  </View>
                  {sortedProducts.map((p, idx) => (
                    <View key={idx} style={[styles.tableRow, idx % 2 === 0 && { backgroundColor: C.surfaceUp }]}>
                      <Text style={[styles.tableCellVal, { flex: 2 }]} numberOfLines={1}>{p.name}</Text>
                      <Text style={[styles.tableCellVal, { color: C.success }]}>{p.qty}</Text>
                      <Text style={styles.tableCellVal}>₱{p.price}</Text>
                      <Text style={[styles.tableCellVal, { textAlign: 'right', fontWeight: '800', color: C.textPrimary }]}>₱{p.total.toLocaleString()}</Text>
                    </View>
                  ))}
                  <View style={styles.tableFooter}>
                    <Text style={styles.tableFooterText}>{store.itemsSold} items · ₱{store.revenue.toLocaleString()}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );

  const renderPeopleTab = () => (
    <View style={{ flex: 1 }}>
      {/* Unified Shifts Banner */}
      <TouchableOpacity style={styles.unifiedBanner} onPress={() => setUnifiedModalVisible(true)} activeOpacity={0.85}>
        <View style={styles.unifiedIconBox}>
          <Ionicons name="git-network" size={22} color={C.gold} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 14 }}>
          <Text style={styles.unifiedTitle}>Assign Unified Shifts</Text>
          <Text style={styles.unifiedSub}>Link staff to multiple store locations</Text>
        </View>
        <View style={styles.unifiedArrow}>
          <Ionicons name="arrow-forward" size={16} color={C.gold} />
        </View>
      </TouchableOpacity>

      {/* Filter Pills */}
      <View style={styles.filterRow}>
        {['all', 'manager', 'merchant'].map(f => (
          <TouchableOpacity key={f} onPress={() => setPeopleFilter(f)} style={[styles.filterPill, peopleFilter === f && styles.filterPillActive]}>
            <Text style={[styles.filterPillText, peopleFilter === f && { color: C.navy }]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.filterCount}>{users.filter(u => peopleFilter === 'all' || u.role === peopleFilter).length} members</Text>
      </View>

      <FlatList
        data={users.filter(u => peopleFilter === 'all' || u.role === peopleFilter)}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.userCard}
            onPress={() => { setSelectedUser(item); setUserModalVisible(true); }}
            activeOpacity={0.8}
          >
            <View style={[styles.userAvatar, { backgroundColor: item.role === 'manager' ? '#1E3A5F' : '#2D1B00' }]}>
              <Text style={[styles.userAvatarText, { color: item.role === 'manager' ? C.info : C.gold }]}>
                {item.first_name?.[0]?.toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, marginHorizontal: 14 }}>
              <Text style={styles.userName}>{item.first_name} {item.last_name}</Text>
              <Text style={styles.userMeta}>{item.role.toUpperCase()} · {item.store_name || 'Unassigned'}</Text>
              {item.violations_count > 0 && (
                <View style={styles.violationTag}>
                  <Ionicons name="warning" size={10} color={C.danger} />
                  <Text style={styles.violationText}>{item.violations_count} violation{item.violations_count > 1 ? 's' : ''}</Text>
                </View>
              )}
            </View>
            <View style={[styles.statusDot, { backgroundColor: item.status === 'active' ? C.success : C.danger }]}>
              <Text style={styles.statusDotText}>{item.status === 'active' ? 'Active' : 'Banned'}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );

  // Inventory search state
  const [invSearch, setInvSearch] = useState('');

  const renderInventoryTab = () => {
    const storeFiltered = allProducts.filter(p => inventoryStoreFilter === 'All' || p.store_name === inventoryStoreFilter);
    const filtered = invSearch.trim()
      ? storeFiltered.filter(p => p.name?.toLowerCase().includes(invSearch.toLowerCase()))
      : storeFiltered;

    const totalAll    = allProducts.length;
    const activeAll   = allProducts.filter(p => p.is_active !== false).length;
    const disabledAll = allProducts.filter(p => p.is_active === false).length;
    const lowStockAll = allProducts.filter(p => p.stock < 5 && p.is_active !== false).length;

    const storeNames = ['All', ...uniqueStoreNames];

    return (
      <FlatList
        data={filtered}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={() => (
          <View>
            {/* ── Stats Grid ── */}
            <View style={styles.invStatGrid}>
              <View style={[styles.invStatCard, { borderColor: C.success + '44' }]}>
                <View style={[styles.invStatIcon, { backgroundColor: C.successBg }]}>
                  <Ionicons name="checkmark-circle" size={18} color={C.success} />
                </View>
                <Text style={[styles.invStatBigVal, { color: C.success }]}>{activeAll}</Text>
                <Text style={styles.invStatCardLabel}>Active</Text>
              </View>
              <View style={[styles.invStatCard, { borderColor: C.danger + '44' }]}>
                <View style={[styles.invStatIcon, { backgroundColor: C.dangerBg }]}>
                  <Ionicons name="ban" size={18} color={C.danger} />
                </View>
                <Text style={[styles.invStatBigVal, { color: C.danger }]}>{disabledAll}</Text>
                <Text style={styles.invStatCardLabel}>Disabled</Text>
              </View>
              <View style={[styles.invStatCard, { borderColor: C.warning + '44' }]}>
                <View style={[styles.invStatIcon, { backgroundColor: C.warnBg }]}>
                  <Ionicons name="warning" size={18} color={C.warning} />
                </View>
                <Text style={[styles.invStatBigVal, { color: C.warning }]}>{lowStockAll}</Text>
                <Text style={styles.invStatCardLabel}>Low Stock</Text>
              </View>
              <View style={[styles.invStatCard, { borderColor: C.border }]}>
                <View style={[styles.invStatIcon, { backgroundColor: C.surfaceUp }]}>
                  <Ionicons name="layers" size={18} color={C.textSecondary} />
                </View>
                <Text style={[styles.invStatBigVal, { color: C.textPrimary }]}>{totalAll}</Text>
                <Text style={styles.invStatCardLabel}>Total SKUs</Text>
              </View>
            </View>

            {/* ── Search Bar ── */}
            <View style={styles.invSearchBar}>
              <Ionicons name="search" size={18} color={C.textMuted} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.invSearchInput}
                placeholder="Search products..."
                placeholderTextColor={C.textMuted}
                value={invSearch}
                onChangeText={setInvSearch}
              />
              {invSearch.length > 0 && (
                <TouchableOpacity onPress={() => setInvSearch('')}>
                  <Ionicons name="close-circle" size={18} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* ── Store Filter ── */}
            <Text style={styles.invFilterLabel}>FILTER BY STORE</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 4, gap: 10 }}
              style={{ marginBottom: 20 }}
            >
              {storeNames.map(s => {
                const isActive = inventoryStoreFilter === s;
                const storeCount = s === 'All'
                  ? allProducts.length
                  : allProducts.filter(p => p.store_name === s).length;
                const storeDisabled = s === 'All'
                  ? disabledAll
                  : allProducts.filter(p => p.store_name === s && p.is_active === false).length;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.invStoreCard, isActive && styles.invStoreCardActive]}
                    onPress={() => { setInventoryStoreFilter(s); Haptics.selectionAsync(); }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.invStoreCardIcon, isActive && { backgroundColor: C.gold + '22', borderColor: C.gold + '55' }]}>
                      <Ionicons
                        name={s === 'All' ? 'globe-outline' : 'storefront-outline'}
                        size={16}
                        color={isActive ? C.gold : C.textMuted}
                      />
                    </View>
                    <Text style={[styles.invStoreCardName, isActive && { color: C.gold }]} numberOfLines={1}>
                      {s}
                    </Text>
                    <View style={styles.invStoreCardMeta}>
                      <Text style={[styles.invStoreCardCount, isActive && { color: C.gold }]}>{storeCount} items</Text>
                      {storeDisabled > 0 && (
                        <View style={styles.invStoreDisabledBadge}>
                          <Text style={styles.invStoreDisabledText}>{storeDisabled} off</Text>
                        </View>
                      )}
                    </View>
                    {isActive && <View style={styles.invStoreActiveBar} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Result count */}
            <View style={styles.invResultRow}>
              <Text style={styles.invResultText}>
                {filtered.length} product{filtered.length !== 1 ? 's' : ''}
                {invSearch ? ` for "${invSearch}"` : inventoryStoreFilter !== 'All' ? ` in ${inventoryStoreFilter}` : ''}
              </Text>
              {(invSearch || inventoryStoreFilter !== 'All') && (
                <TouchableOpacity onPress={() => { setInvSearch(''); setInventoryStoreFilter('All'); }}>
                  <Text style={styles.invClearText}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        renderItem={({ item, index }) => {
          const isDisabled = item.is_active === false;
          const isLowStock = !isDisabled && item.stock < 5;
          const stockColor = isDisabled ? C.danger : isLowStock ? C.warning : C.success;
          const stockBg    = isDisabled ? C.dangerBg : isLowStock ? C.warnBg : C.successBg;

          return (
            <TouchableOpacity
              style={[styles.invProductCard, isDisabled && styles.invProductCardDisabled]}
              onPress={() => { setSelectedProduct(item); setProductActionModal(true); }}
              activeOpacity={0.8}
            >
              {/* Image / Icon */}
              <View style={[styles.invProductImage, isDisabled && { borderColor: C.danger + '44' }]}>
                {item.image_url
                  ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%', borderRadius: 16 }} />
                  : <View style={[styles.invProductImagePlaceholder, { backgroundColor: isDisabled ? C.dangerBg : C.surfaceUp }]}>
                      <Ionicons name="cube" size={26} color={isDisabled ? C.danger + '66' : C.textMuted} />
                    </View>
                }
                {isDisabled && (
                  <View style={styles.invDisabledOverlay}>
                    <Ionicons name="ban" size={16} color={C.danger} />
                  </View>
                )}
              </View>

              {/* Info */}
              <View style={styles.invProductInfo}>
                <View style={styles.invProductTopRow}>
                  <Text style={[styles.invProductName, isDisabled && { color: C.textMuted }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {isDisabled ? (
                    <View style={styles.invOffBadge}>
                      <Text style={styles.invOffBadgeText}>OFF</Text>
                    </View>
                  ) : (
                    <Text style={styles.invProductPrice}>₱{item.price?.toLocaleString()}</Text>
                  )}
                </View>

                <Text style={styles.invProductStore} numberOfLines={1}>
                  <Ionicons name="storefront-outline" size={10} color={C.textMuted} /> {item.store_name || 'No Store'}
                </Text>

                {/* Stock bar */}
                <View style={styles.invStockRow}>
                  <View style={[styles.invStockBadge, { backgroundColor: stockBg, borderColor: stockColor + '44' }]}>
                    <View style={[styles.invStockDot, { backgroundColor: stockColor }]} />
                    <Text style={[styles.invStockText, { color: stockColor }]}>
                      {isDisabled ? 'Disabled' : isLowStock ? `Low · ${item.stock}` : `${item.stock} in stock`}
                    </Text>
                  </View>
                  {!isDisabled && (
                    <View style={styles.invStockBarTrack}>
                      <View style={[
                        styles.invStockBarFill,
                        {
                          width: `${Math.min((item.stock / Math.max(item.stock, 20)) * 100, 100)}%`,
                          backgroundColor: stockColor,
                        }
                      ]} />
                    </View>
                  )}
                </View>
              </View>

              <Ionicons name="chevron-forward" size={14} color={C.textMuted} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.invEmptyState}>
            <View style={styles.invEmptyIcon}>
              <Ionicons name="cube-outline" size={36} color={C.textMuted} />
            </View>
            <Text style={styles.invEmptyTitle}>No products found</Text>
            <Text style={styles.invEmptyDesc}>
              {invSearch ? `No results for "${invSearch}"` : 'No products match the selected filter.'}
            </Text>
          </View>
        }
      />
    );
  };

  const renderAlertsTab = () => (
    <View style={{ flex: 1 }}>
      {/* Alert Hero */}
      <View style={[styles.alertHero, { backgroundColor: flags.length > 0 ? C.dangerBg : C.successBg, borderColor: flags.length > 0 ? C.danger + '44' : C.success + '44' }]}>
        <View style={[styles.alertHeroIcon, { backgroundColor: flags.length > 0 ? C.danger + '22' : C.success + '22' }]}>
          <Ionicons name={flags.length > 0 ? 'warning' : 'shield-checkmark'} size={32} color={flags.length > 0 ? C.danger : C.success} />
        </View>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={[styles.alertHeroTitle, { color: flags.length > 0 ? C.danger : C.success }]}>
            {flags.length > 0 ? `${flags.length} Active Alerts` : 'All Clear'}
          </Text>
          <Text style={styles.alertHeroSub}>Automated fraud & integrity monitoring</Text>
        </View>
      </View>

      <FlatList
        data={flags}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} />}
        renderItem={({ item }) => {
          const isHigh = item.type === 'unauthorized_stock' || item.type === 'admin_action';
          const accentColor = isHigh ? C.danger : C.warning;
          return (
            <View style={[styles.flagCard, { borderLeftColor: accentColor }]}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[styles.flagIconBox, { backgroundColor: accentColor + '22' }]}>
                  <Ionicons name={item.type === 'admin_action' ? 'lock-closed' : 'alert-circle'} size={20} color={accentColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.flagTitle}>{item.title}</Text>
                  <Text style={styles.flagDesc}>{item.description}</Text>
                  {item.user_id && (
                    <Text style={styles.flagUser}>
                      {item.profiles?.first_name} {item.profiles?.last_name} · {item.store_name}
                    </Text>
                  )}
                  <Text style={styles.flagDate}>{new Date(item.created_at).toLocaleString()}</Text>
                </View>
              </View>

              <View style={styles.flagActionRow}>
                <TouchableOpacity
                  style={styles.flagDismissBtn}
                  onPress={() => showConfirm({
                    title: 'Dismiss Alert',
                    message: 'Mark this alert as dismissed? This cannot be undone.',
                    confirmLabel: 'Dismiss',
                    confirmColor: C.textSecondary,
                    onConfirm: () => handleFlagAction(item.id, 'dismiss'),
                  })}
                >
                  <Text style={styles.flagDismissText}>Dismiss</Text>
                </TouchableOpacity>
                {item.user_id && (
                  <>
                    <TouchableOpacity
                      style={styles.flagWarnBtn}
                      onPress={() => showConfirm({
                        title: 'Warn User',
                        message: `Issue a formal warning to ${item.profiles?.first_name}? Their violation count will increase.`,
                        confirmLabel: 'Send Warning',
                        confirmColor: C.warning,
                        onConfirm: () => handleFlagAction(item.id, 'warn', item.user_id),
                      })}
                    >
                      <Ionicons name="warning-outline" size={13} color={C.warning} />
                      <Text style={styles.flagWarnText}>Warn</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.flagSuspendBtn}
                      onPress={() => showConfirm({
                        title: 'Suspend User',
                        message: `Permanently revoke access for ${item.profiles?.first_name}? They will be locked out immediately.`,
                        confirmLabel: 'Suspend',
                        confirmColor: C.danger,
                        onConfirm: () => handleFlagAction(item.id, 'suspend', item.user_id),
                      })}
                    >
                      <Ionicons name="ban-outline" size={13} color={C.danger} />
                      <Text style={styles.flagSuspendText}>Suspend</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );

  // ── MODALS ────────────────────────────────────────────────────────────────

  const renderProductModal = () => (
    <Modal visible={productActionModal} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetOverlay}>
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />

          {/* Product header */}
          <View style={styles.sheetProductHeader}>
            <View style={styles.sheetProductIcon}>
              {selectedProduct?.image_url
                ? <Image source={{ uri: selectedProduct.image_url }} style={{ width: '100%', height: '100%', borderRadius: 14 }} />
                : <Ionicons name="cube-outline" size={28} color={C.textSecondary} />
              }
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={styles.sheetTitle}>{selectedProduct?.name}</Text>
              <Text style={styles.sheetSub}>{selectedProduct?.store_name || 'No Store'}</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                <View style={styles.sheetStatChip}><Text style={styles.sheetStatText}>₱{selectedProduct?.price}</Text></View>
                <View style={styles.sheetStatChip}><Text style={styles.sheetStatText}>Stock: {selectedProduct?.stock}</Text></View>
              </View>
            </View>
          </View>

          {selectedProduct?.is_active === false ? (
            <View>
              <View style={styles.disabledNotice}>
                <Ionicons name="ban" size={20} color={C.danger} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.disabledNoticeTitle}>Product is Disabled</Text>
                  <Text style={styles.disabledNoticeText}>Not visible to cashiers in POS.</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.restoreBtn}
                onPress={() => showConfirm({
                  title: 'Restore Product',
                  message: `Re-activate "${selectedProduct?.name}" for use in POS systems?`,
                  confirmLabel: 'Restore',
                  confirmColor: C.success,
                  onConfirm: handleRestoreProduct,
                })}
              >
                <Ionicons name="refresh-circle" size={20} color={C.white} />
                <Text style={styles.restoreBtnText}>Restore Product</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={styles.inputLabel}>Reason for Disabling</Text>
              <TextInput
                style={styles.reasonInput}
                placeholder="e.g. Price anomaly, Suspicious stock amount..."
                placeholderTextColor={C.textMuted}
                multiline
                numberOfLines={3}
                value={flagReason}
                onChangeText={setFlagReason}
              />
              <TouchableOpacity
                style={[styles.disableBtn, { opacity: flagReason.trim().length > 0 ? 1 : 0.4 }]}
                disabled={flagReason.trim().length === 0}
                onPress={() => showConfirm({
                  title: 'Disable Product',
                  message: `Flag and remove "${selectedProduct?.name}" from active inventory?`,
                  confirmLabel: 'Flag & Disable',
                  confirmColor: C.danger,
                  onConfirm: handleDisableProduct,
                })}
              >
                <Ionicons name="ban" size={18} color={C.white} />
                <Text style={styles.disableBtnText}>Flag & Disable</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => { setProductActionModal(false); setFlagReason(''); }}>
            <Text style={styles.sheetCancelText}>Close</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderBroadcastModal = () => (
    <Modal visible={broadcastVisible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.centerOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalCardHeader}>
            <View style={styles.modalIconBox}>
              <Ionicons name="megaphone" size={22} color={C.gold} />
            </View>
            <Text style={styles.modalCardTitle}>Compose Announcement</Text>
            <TouchableOpacity onPress={() => setBroadcastVisible(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={20} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabel}>Priority Level</Text>
          <View style={styles.priorityRow}>
            <TouchableOpacity
              style={[styles.priorityBtn, broadcastType === 'info' && { backgroundColor: C.info, borderColor: C.info }]}
              onPress={() => setBroadcastType('info')}
            >
              <Ionicons name="information-circle" size={16} color={broadcastType === 'info' ? '#fff' : C.info} />
              <Text style={[styles.priorityText, broadcastType === 'info' && { color: '#fff' }]}>Info</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.priorityBtn, broadcastType === 'urgent' && { backgroundColor: C.danger, borderColor: C.danger }]}
              onPress={() => setBroadcastType('urgent')}
            >
              <Ionicons name="warning" size={16} color={broadcastType === 'urgent' ? '#fff' : C.danger} />
              <Text style={[styles.priorityText, broadcastType === 'urgent' && { color: '#fff' }]}>Urgent</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabel}>Target</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 40, marginBottom: 16 }}>
            {['ALL', ...storeData.map(s => s.name)].map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.storeChip, broadcastTarget === s && styles.storeChipActive]}
                onPress={() => setBroadcastTarget(s)}
              >
                <Text style={[styles.storeChipText, broadcastTarget === s && { color: C.navy }]}>{s === 'ALL' ? 'All Stores' : s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.inputLabel}>Message</Text>
          <TextInput
            style={styles.messageInput}
            placeholder="Type your announcement here..."
            placeholderTextColor={C.textMuted}
            multiline
            numberOfLines={4}
            value={broadcastMsg}
            onChangeText={setBroadcastMsg}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setBroadcastVisible(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.publishBtn} onPress={handleSendBroadcast} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={styles.publishBtnText}>Publish</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderUserModal = () => (
    <Modal visible={userModalVisible} animationType="fade" transparent>
      <View style={styles.centerOverlay}>
        <View style={styles.modalCard}>
          <TouchableOpacity onPress={() => setUserModalVisible(false)} style={[styles.modalCloseBtn, { position: 'absolute', top: 16, right: 16, zIndex: 10 }]}>
            <Ionicons name="close" size={20} color={C.textSecondary} />
          </TouchableOpacity>

          {/* Avatar & Info */}
          <View style={styles.userModalTop}>
            <View style={[styles.userModalAvatar, { backgroundColor: selectedUser?.role === 'manager' ? '#1E3A5F' : '#2D1B00' }]}>
              <Text style={[styles.userModalAvatarText, { color: selectedUser?.role === 'manager' ? C.info : C.gold }]}>
                {selectedUser?.first_name?.[0]?.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.userModalName}>{selectedUser?.first_name} {selectedUser?.last_name}</Text>
            <View style={styles.userModalMetaRow}>
              <View style={[styles.userModalRoleBadge, { backgroundColor: selectedUser?.role === 'manager' ? C.infoBg : C.warnBg }]}>
                <Text style={[styles.userModalRoleText, { color: selectedUser?.role === 'manager' ? C.info : C.gold }]}>
                  {selectedUser?.role?.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.userModalStore}>{selectedUser?.store_name || 'Unassigned'}</Text>
            </View>
            {selectedUser?.violations_count > 0 && (
              <View style={styles.violationBanner}>
                <Ionicons name="warning" size={14} color={C.danger} />
                <Text style={styles.violationBannerText}>{selectedUser.violations_count} Violation{selectedUser.violations_count > 1 ? 's' : ''} on record</Text>
              </View>
            )}
          </View>

          {/* Activity */}
          <Text style={styles.inputLabel}>Recent Activity</Text>
          <View style={styles.activityBox}>
            <ScrollView style={{ maxHeight: 140 }}>
              {auditLogs.filter(l => l.user_id === selectedUser?.id).slice(0, 6).length === 0
                ? <Text style={styles.emptyText}>No recent activity.</Text>
                : auditLogs.filter(l => l.user_id === selectedUser?.id).slice(0, 6).map(log => (
                    <View key={log.id} style={styles.activityRow}>
                      <View style={styles.activityDot} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.activityText}>{log.description}</Text>
                        <Text style={styles.activityTime}>{new Date(log.created_at).toLocaleString()}</Text>
                      </View>
                    </View>
                  ))
              }
            </ScrollView>
          </View>

          <TouchableOpacity
            style={[styles.userActionBtn, { backgroundColor: selectedUser?.status === 'active' ? C.danger : C.success }]}
            onPress={() => showConfirm({
              title: selectedUser?.status === 'active' ? 'Suspend User' : 'Restore Access',
              message: selectedUser?.status === 'active'
                ? `Revoke access for ${selectedUser?.first_name}? They will be locked out immediately.`
                : `Restore access for ${selectedUser?.first_name}? They can log in again.`,
              confirmLabel: selectedUser?.status === 'active' ? 'Suspend' : 'Restore',
              confirmColor: selectedUser?.status === 'active' ? C.danger : C.success,
              onConfirm: toggleUserBan,
            })}
          >
            <Ionicons name={selectedUser?.status === 'active' ? 'ban' : 'checkmark-circle'} size={18} color="#fff" />
            <Text style={styles.userActionBtnText}>
              {selectedUser?.status === 'active' ? 'Suspend User' : 'Restore Access'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ── UNIFIED WIZARD ─────────────────────────────────────────────────────────
  const [unifiedStep, setUnifiedStep] = useState(1); // 1, 2, 3
  const wizardSlide = useRef(new Animated.Value(0)).current;

  const goToStep = (step) => {
    const dir = step > unifiedStep ? 1 : -1;
    Animated.sequence([
      Animated.timing(wizardSlide, { toValue: -dir * width * 0.6, duration: 0, useNativeDriver: true }),
      Animated.spring(wizardSlide, { toValue: 0, tension: 80, friction: 14, useNativeDriver: true }),
    ]).start();
    setUnifiedStep(step);
    Haptics.selectionAsync();
  };

  const closeUnifiedModal = () => {
    setUnifiedModalVisible(false);
    setTimeout(() => {
      setUnifiedStep(1);
      setSelectedMerchantsForUnified([]);
      setSelectedStoresForUnified([]);
    }, 300);
  };

  const WIZARD_STEPS = [
    { num: 1, label: 'Select Staff',  icon: 'people' },
    { num: 2, label: 'Select Stores', icon: 'storefront' },
    { num: 3, label: 'Review',        icon: 'checkmark-circle' },
  ];

  const renderUnifiedModal = () => {
    const merchants = users.filter(u => u.role === 'merchant');
    const managers  = users.filter(u => u.role === 'manager');
    const totalInvites = selectedMerchantsForUnified.length * selectedStoresForUnified.length;

    return (
      <Modal visible={unifiedModalVisible} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <View style={styles.wizardSheet}>
            {/* Drag handle */}
            <View style={styles.sheetHandle} />

            {/* Header */}
            <View style={styles.wizardHeader}>
              <View style={styles.wizardIconBox}>
                <Ionicons name="git-network" size={20} color={C.gold} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.wizardTitle}>Unified Shifts</Text>
                <Text style={styles.wizardSubtitle}>Step {unifiedStep} of 3</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={closeUnifiedModal}>
                <Ionicons name="close" size={18} color={C.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Step Progress Bar */}
            <View style={styles.stepTrack}>
              {WIZARD_STEPS.map((s, idx) => {
                const done    = unifiedStep > s.num;
                const active  = unifiedStep === s.num;
                const lineActive = unifiedStep > s.num;
                return (
                  <React.Fragment key={s.num}>
                    <TouchableOpacity
                      style={styles.stepNodeWrap}
                      onPress={() => { if (done) goToStep(s.num); }}
                      activeOpacity={done ? 0.7 : 1}
                    >
                      <View style={[
                        styles.stepNode,
                        active && styles.stepNodeActive,
                        done   && styles.stepNodeDone,
                      ]}>
                        {done
                          ? <Ionicons name="checkmark" size={14} color={C.navy} />
                          : <Text style={[styles.stepNodeText, active && { color: C.navy }, done && { color: C.navy }]}>{s.num}</Text>
                        }
                      </View>
                      <Text style={[styles.stepLabel, (active || done) && styles.stepLabelActive]}>{s.label}</Text>
                    </TouchableOpacity>
                    {idx < WIZARD_STEPS.length - 1 && (
                      <View style={[styles.stepLine, lineActive && styles.stepLineActive]} />
                    )}
                  </React.Fragment>
                );
              })}
            </View>

            {/* ── STEP CONTENT ── */}
            <Animated.View style={[styles.wizardBody, { transform: [{ translateX: wizardSlide }] }]}>

              {/* STEP 1 — Select Staff */}
              {unifiedStep === 1 && (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                  <Text style={styles.wizardStepHeading}>Who should work the shifts?</Text>
                  <Text style={styles.wizardStepDesc}>Select one or more staff members to assign.</Text>

                  {merchants.length === 0 ? (
                    <View style={styles.wizardEmpty}>
                      <Ionicons name="person-outline" size={40} color={C.textMuted} />
                      <Text style={styles.wizardEmptyText}>No staff members found</Text>
                    </View>
                  ) : merchants.map(m => {
                    const sel = selectedMerchantsForUnified.includes(m.id);
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.wizardPersonRow, sel && styles.wizardPersonRowActive]}
                        onPress={() => toggleMerchantSelection(m.id)}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.wizardAvatar, { backgroundColor: sel ? C.gold + '33' : C.surfaceUp }]}>
                          <Text style={[styles.wizardAvatarText, { color: sel ? C.gold : C.textMuted }]}>
                            {m.first_name?.[0]?.toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1, marginHorizontal: 14 }}>
                          <Text style={[styles.wizardPersonName, sel && { color: C.textPrimary }]}>
                            {m.first_name} {m.last_name}
                          </Text>
                          <Text style={styles.wizardPersonMeta}>
                            {m.store_name || 'Unassigned'} · Staff
                          </Text>
                        </View>
                        <View style={[styles.wizardCheckBox, sel && styles.wizardCheckBoxActive]}>
                          {sel && <Ionicons name="checkmark" size={14} color={C.navy} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* STEP 2 — Select Stores */}
              {unifiedStep === 2 && (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                  <Text style={styles.wizardStepHeading}>Which stores will they work?</Text>
                  <Text style={styles.wizardStepDesc}>Select one or more target store locations.</Text>

                  {managers.length === 0 ? (
                    <View style={styles.wizardEmpty}>
                      <Ionicons name="storefront-outline" size={40} color={C.textMuted} />
                      <Text style={styles.wizardEmptyText}>No stores found</Text>
                    </View>
                  ) : managers.map(s => {
                    const sel = selectedStoresForUnified.includes(s.id);
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.wizardStoreRow, sel && styles.wizardStoreRowActive]}
                        onPress={() => toggleStoreSelection(s.id)}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.wizardStoreIconBox, sel && { backgroundColor: C.gold + '22', borderColor: C.gold + '55' }]}>
                          <Ionicons name="storefront" size={22} color={sel ? C.gold : C.textSecondary} />
                        </View>
                        <View style={{ flex: 1, marginHorizontal: 14 }}>
                          <Text style={[styles.wizardStoreName, sel && { color: C.textPrimary }]}>{s.store_name}</Text>
                          <Text style={styles.wizardStoreMeta}>Manager: {s.first_name} {s.last_name}</Text>
                        </View>
                        <View style={[styles.wizardCheckBox, sel && styles.wizardCheckBoxActive]}>
                          {sel && <Ionicons name="checkmark" size={14} color={C.navy} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* STEP 3 — Review */}
              {unifiedStep === 3 && (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                  <Text style={styles.wizardStepHeading}>Review & Confirm</Text>
                  <Text style={styles.wizardStepDesc}>Double-check before sending invitations.</Text>

                  {/* Invite Count Hero */}
                  <View style={styles.reviewHero}>
                    <Text style={styles.reviewHeroCount}>{totalInvites}</Text>
                    <Text style={styles.reviewHeroLabel}>Shift Invitations</Text>
                    <Text style={styles.reviewHeroSub}>
                      {selectedMerchantsForUnified.length} staff × {selectedStoresForUnified.length} store{selectedStoresForUnified.length > 1 ? 's' : ''}
                    </Text>
                  </View>

                  {/* Staff List */}
                  <View style={styles.reviewSection}>
                    <View style={styles.reviewSectionHeader}>
                      <Ionicons name="people" size={14} color={C.info} />
                      <Text style={[styles.reviewSectionTitle, { color: C.info }]}>Staff Selected</Text>
                      <View style={[styles.reviewCountBadge, { backgroundColor: C.infoBg }]}>
                        <Text style={[styles.reviewCountText, { color: C.info }]}>{selectedMerchantsForUnified.length}</Text>
                      </View>
                    </View>
                    {users.filter(u => selectedMerchantsForUnified.includes(u.id)).map(m => (
                      <View key={m.id} style={styles.reviewItem}>
                        <View style={[styles.reviewDot, { backgroundColor: C.info }]} />
                        <Text style={styles.reviewItemText}>{m.first_name} {m.last_name}</Text>
                        <TouchableOpacity onPress={() => toggleMerchantSelection(m.id)}>
                          <Ionicons name="close-circle" size={16} color={C.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>

                  {/* Stores List */}
                  <View style={styles.reviewSection}>
                    <View style={styles.reviewSectionHeader}>
                      <Ionicons name="storefront" size={14} color={C.gold} />
                      <Text style={[styles.reviewSectionTitle, { color: C.gold }]}>Stores Selected</Text>
                      <View style={[styles.reviewCountBadge, { backgroundColor: C.warnBg }]}>
                        <Text style={[styles.reviewCountText, { color: C.gold }]}>{selectedStoresForUnified.length}</Text>
                      </View>
                    </View>
                    {users.filter(u => selectedStoresForUnified.includes(u.id)).map(s => (
                      <View key={s.id} style={styles.reviewItem}>
                        <View style={[styles.reviewDot, { backgroundColor: C.gold }]} />
                        <Text style={styles.reviewItemText}>{s.store_name}</Text>
                        <TouchableOpacity onPress={() => toggleStoreSelection(s.id)}>
                          <Ionicons name="close-circle" size={16} color={C.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </Animated.View>

            {/* ── Footer Nav ── */}
            <View style={styles.wizardFooter}>
              {unifiedStep > 1 ? (
                <TouchableOpacity style={styles.wizardBackBtn} onPress={() => goToStep(unifiedStep - 1)}>
                  <Ionicons name="arrow-back" size={18} color={C.textSecondary} />
                  <Text style={styles.wizardBackText}>Back</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.wizardBackBtn} onPress={closeUnifiedModal}>
                  <Text style={styles.wizardBackText}>Cancel</Text>
                </TouchableOpacity>
              )}

              {unifiedStep < 3 ? (
                <TouchableOpacity
                  style={[
                    styles.wizardNextBtn,
                    { opacity: (unifiedStep === 1 && selectedMerchantsForUnified.length === 0) || (unifiedStep === 2 && selectedStoresForUnified.length === 0) ? 0.4 : 1 }
                  ]}
                  disabled={(unifiedStep === 1 && selectedMerchantsForUnified.length === 0) || (unifiedStep === 2 && selectedStoresForUnified.length === 0)}
                  onPress={() => goToStep(unifiedStep + 1)}
                >
                  <Text style={styles.wizardNextText}>
                    {unifiedStep === 1
                      ? `Continue · ${selectedMerchantsForUnified.length} selected`
                      : `Review · ${selectedStoresForUnified.length} selected`}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={C.navy} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.wizardSendBtn, { opacity: totalInvites > 0 ? 1 : 0.4 }]}
                  disabled={loading || totalInvites === 0}
                  onPress={() => showConfirm({
                    title: 'Send Invitations',
                    message: `Send ${totalInvites} shift invitation${totalInvites > 1 ? 's' : ''} to selected staff?`,
                    confirmLabel: 'Send Invites',
                    confirmColor: C.indigo,
                    onConfirm: handleSendUnifiedInvites,
                  })}
                >
                  {loading
                    ? <ActivityIndicator color={C.navy} size="small" />
                    : <>
                        <Ionicons name="send" size={18} color={C.navy} />
                        <Text style={styles.wizardSendText}>Send {totalInvites} Invite{totalInvites > 1 ? 's' : ''}</Text>
                      </>
                  }
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // ── MAIN RENDER ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerEyebrow}>OWNER HUB</Text>
            <Text style={styles.headerTitle}>Command Center</Text>
          </View>
          <TouchableOpacity style={styles.broadcastTrigger} onPress={() => setBroadcastVisible(true)}>
            <Ionicons name="megaphone-outline" size={20} color={C.gold} />
            {flags.length > 0 && <View style={styles.alertDot} />}
          </TouchableOpacity>
        </View>

        {/* Animated Tab Bar */}
        <View style={styles.tabBarWrap}>
          <Animated.View style={[styles.tabIndicator, { transform: [{ translateX: tabIndicatorX }], width: tabWidth - 8 }]} />
          {TABS.map((tab, idx) => {
            const isActive = currentTab === tab.id;
            return (
              <TouchableOpacity key={tab.id} style={[styles.tabBtn, { width: tabWidth }]} onPress={() => switchTab(tab.id)}>
                <Ionicons name={isActive ? tab.iconActive : tab.icon} size={16} color={isActive ? C.navy : C.textMuted} />
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
                {tab.id === 'alerts' && flags.length > 0 && (
                  <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{flags.length}</Text></View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Body */}
      <View style={styles.body}>
        {currentTab === 'stores' && renderStoreAnalytics()}
        {currentTab === 'people' && renderPeopleTab()}
        {currentTab === 'inventory' && renderInventoryTab()}
        {currentTab === 'alerts' && renderAlertsTab()}
      </View>

      {renderProductModal()}
      {renderBroadcastModal()}
      {renderUserModal()}
      {renderUnifiedModal()}

      {/* Global Confirmation Modal */}
      {confirmConfig && (
        <ConfirmModal
          visible={!!confirmConfig}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          confirmColor={confirmConfig.confirmColor}
          onConfirm={confirmConfig.onConfirm}
          onCancel={hideConfirm}
          loading={confirmLoading}
        />
      )}
    </SafeAreaView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── Header ──
  header: {
    backgroundColor: C.surface,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 20,
  },
  headerEyebrow: {
    fontSize: 10, fontWeight: '800',
    color: C.textMuted, letterSpacing: 2,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 26, fontWeight: '900',
    color: C.textPrimary, letterSpacing: -0.5,
  },
  broadcastTrigger: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: C.surfaceUp,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
    position: 'relative',
  },
  alertDot: {
    position: 'absolute', top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.danger, borderWidth: 1, borderColor: C.surface,
  },

  // ── Animated Tab Bar ──
  tabBarWrap: {
    flexDirection: 'row', height: 52,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 6, left: 4, height: 40,
    backgroundColor: C.textPrimary,
    borderRadius: 11,
    zIndex: 0,
  },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, zIndex: 1, position: 'relative',
  },
  tabLabel: {
    fontSize: 12, fontWeight: '700',
    color: C.textMuted,
  },
  tabLabelActive: { color: C.navy },
  tabBadge: {
    position: 'absolute', top: 6, right: 6,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: C.danger,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  tabBadgeText: { fontSize: 9, fontWeight: '900', color: '#fff' },

  // ── Body ──
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },

  // ── Range Selector ──
  rangeRow: {
    flexDirection: 'row', gap: 8, marginBottom: 20,
    backgroundColor: C.surface, borderRadius: 14, padding: 4,
    borderWidth: 1, borderColor: C.border,
  },
  rangeBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 11,
  },
  rangeBtnActive: { backgroundColor: C.indigo },
  rangeBtnText: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  rangeBtnTextActive: { color: C.textPrimary, fontWeight: '800' },

  // ── Hero Card ──
  heroCard: {
    backgroundColor: C.indigo, borderRadius: 20, padding: 24,
    marginBottom: 20, borderWidth: 1, borderColor: C.indigoMid,
    ...C.shadow,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroBadgeText: { fontSize: 10, fontWeight: '800', color: C.gold, letterSpacing: 1.5 },
  heroStoreCount: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  heroAmount: { fontSize: 38, fontWeight: '900', color: C.textPrimary, letterSpacing: -1, marginBottom: 16 },
  heroStatRow: { flexDirection: 'row', gap: 10 },
  statPill: {
    flex: 1, borderRadius: 12, borderWidth: 1,
    paddingVertical: 10, alignItems: 'center',
  },
  statPillVal: { fontSize: 16, fontWeight: '900' },
  statPillLabel: { fontSize: 9, color: C.textMuted, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },

  // ── Store Card ──
  storeCard: {
    backgroundColor: C.surface, borderRadius: 18,
    marginBottom: 14, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  storeCardHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 18,
  },
  storeRankBadge: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  storeRank: { fontSize: 13, fontWeight: '900' },
  storeName: { fontSize: 16, fontWeight: '800', color: C.textPrimary },
  storeRevPreview: { fontSize: 13, color: C.success, fontWeight: '600', marginTop: 2 },
  storeChevron: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: C.surfaceUp,
    alignItems: 'center', justifyContent: 'center',
  },
  storeExpanded: { padding: 18, paddingTop: 0, borderTopWidth: 1, borderTopColor: C.border },

  // ── Section Header ──
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 12, gap: 8 },
  sectionHeaderDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.gold },
  sectionHeaderText: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 1.5 },
  sectionHeaderLine: { flex: 1, height: 1, backgroundColor: C.border },

  // ── Calc Card ──
  calcCard: { backgroundColor: C.surfaceUp, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  calcLabel: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  calcValWhite: { fontSize: 15, fontWeight: '700', color: C.textPrimary },
  calcDivider: { height: 1, backgroundColor: C.border, marginVertical: 10 },
  rateBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.warnBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.gold + '44' },
  rateInput: { fontSize: 14, fontWeight: '800', color: C.gold, minWidth: 28, textAlign: 'center', padding: 0 },
  rateSymbol: { fontSize: 14, fontWeight: '800', color: C.gold },

  // ── Insights ──
  insightsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  insightChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  insightText: { fontSize: 12, fontWeight: '700' },

  // ── Table ──
  tableCard: { backgroundColor: C.surfaceUp, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  tableCell: { flex: 1, fontSize: 9, fontWeight: '800', color: C.textMuted, letterSpacing: 0.8 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10 },
  tableCellVal: { flex: 1, fontSize: 12, color: C.textSecondary, fontWeight: '600' },
  tableFooter: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border, alignItems: 'flex-end' },
  tableFooterText: { fontSize: 12, fontWeight: '800', color: C.textPrimary },

  // ── People Tab ──
  unifiedBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 16,
    padding: 18, marginBottom: 18,
    borderWidth: 1, borderColor: C.gold + '44',
  },
  unifiedIconBox: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: C.warnBg, borderWidth: 1, borderColor: C.gold + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  unifiedTitle: { fontSize: 16, fontWeight: '800', color: C.textPrimary },
  unifiedSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  unifiedArrow: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.warnBg, alignItems: 'center', justifyContent: 'center' },

  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  filterPillActive: { backgroundColor: C.textPrimary, borderColor: C.textPrimary },
  filterPillText: { fontSize: 12, fontWeight: '700', color: C.textSecondary },
  filterCount: { marginLeft: 'auto', fontSize: 12, color: C.textMuted, fontWeight: '600' },

  userCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, padding: 16,
    borderRadius: 16, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  userAvatar: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: 18, fontWeight: '900' },
  userName: { fontSize: 15, fontWeight: '800', color: C.textPrimary },
  userMeta: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginTop: 2 },
  violationTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, backgroundColor: C.dangerBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  violationText: { fontSize: 10, color: C.danger, fontWeight: '800' },
  statusDot: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDotText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  // ── Inventory Tab ──
  // Stat grid
  invStatGrid: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  invStatCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: 16,
    padding: 14, alignItems: 'center', borderWidth: 1,
  },
  invStatIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  invStatBigVal: { fontSize: 20, fontWeight: '900', lineHeight: 22 },
  invStatCardLabel: { fontSize: 9, fontWeight: '700', color: C.textMuted, letterSpacing: 0.5, marginTop: 3 },

  // Search bar
  invSearchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 14,
    paddingHorizontal: 16, height: 50,
    borderWidth: 1, borderColor: C.border, marginBottom: 20,
  },
  invSearchInput: { flex: 1, fontSize: 14, color: C.textPrimary },

  // Filter label
  invFilterLabel: {
    fontSize: 10, fontWeight: '800', color: C.textMuted,
    letterSpacing: 1.5, marginBottom: 12,
  },

  // Store filter cards
  invStoreCard: {
    width: 130, backgroundColor: C.surface,
    borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: C.border,
    position: 'relative', overflow: 'hidden',
  },
  invStoreCardActive: { borderColor: C.gold },
  invStoreCardIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: C.surfaceUp, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  invStoreCardName: {
    fontSize: 13, fontWeight: '800',
    color: C.textSecondary, marginBottom: 6,
  },
  invStoreCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  invStoreCardCount: { fontSize: 11, fontWeight: '600', color: C.textMuted },
  invStoreDisabledBadge: {
    backgroundColor: C.dangerBg, paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 5, borderWidth: 1, borderColor: C.danger + '44',
  },
  invStoreDisabledText: { fontSize: 9, fontWeight: '800', color: C.danger },
  invStoreActiveBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 3, backgroundColor: C.gold,
  },

  // Result row
  invResultRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  invResultText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  invClearText: { fontSize: 12, color: C.gold, fontWeight: '700' },

  // Product cards
  invProductCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, padding: 16,
    borderRadius: 18, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  invProductCardDisabled: {
    backgroundColor: C.dangerBg + 'AA',
    borderColor: C.danger + '33',
  },
  invProductImage: {
    width: 64, height: 64, borderRadius: 16,
    borderWidth: 1, borderColor: C.border,
    overflow: 'hidden', position: 'relative',
  },
  invProductImagePlaceholder: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  invDisabledOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  invProductInfo: { flex: 1, marginLeft: 14 },
  invProductTopRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 4,
  },
  invProductName: {
    flex: 1, fontSize: 15, fontWeight: '800',
    color: C.textPrimary, marginRight: 8,
  },
  invProductPrice: { fontSize: 14, fontWeight: '900', color: C.gold },
  invProductStore: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 10 },
  invOffBadge: {
    backgroundColor: C.dangerBg, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, borderColor: C.danger + '55',
  },
  invOffBadgeText: { fontSize: 10, fontWeight: '900', color: C.danger },

  // Stock indicator
  invStockRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  invStockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
  },
  invStockDot: { width: 5, height: 5, borderRadius: 3 },
  invStockText: { fontSize: 10, fontWeight: '700' },
  invStockBarTrack: {
    flex: 1, height: 4, backgroundColor: C.border,
    borderRadius: 2, overflow: 'hidden',
  },
  invStockBarFill: { height: '100%', borderRadius: 2 },

  // Empty state
  invEmptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  invEmptyIcon: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border, marginBottom: 4,
  },
  invEmptyTitle: { fontSize: 16, fontWeight: '800', color: C.textSecondary },
  invEmptyDesc: { fontSize: 13, color: C.textMuted, textAlign: 'center' },

  // Keep these for broadcast/other uses
  storeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.surface, marginRight: 8, borderWidth: 1, borderColor: C.border },
  storeChipActive: { backgroundColor: C.textPrimary, borderColor: C.textPrimary },
  storeChipText: { fontSize: 12, fontWeight: '700', color: C.textSecondary },
  productCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  productCardDisabled: { backgroundColor: C.dangerBg, borderColor: C.danger + '44' },
  productIconBox: { width: 52, height: 52, borderRadius: 14, backgroundColor: C.surfaceUp, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  productName: { fontSize: 15, fontWeight: '800', color: C.textPrimary },
  productStore: { fontSize: 11, color: C.indigoMid, fontWeight: '700', marginTop: 2 },
  productMeta: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
  disabledBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.dangerBg, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: C.danger + '44' },
  disabledBadgeText: { fontSize: 10, fontWeight: '900', color: C.danger },

  // ── Alerts Tab ──
  alertHero: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 16, marginBottom: 16, borderWidth: 1 },
  alertHeroIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  alertHeroTitle: { fontSize: 18, fontWeight: '900' },
  alertHeroSub: { fontSize: 12, color: C.textMuted, marginTop: 3 },

  flagCard: { backgroundColor: C.surface, padding: 16, borderRadius: 16, marginBottom: 12, borderLeftWidth: 4, borderWidth: 1, borderColor: C.border },
  flagIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  flagTitle: { fontSize: 14, fontWeight: '800', color: C.textPrimary, marginBottom: 4 },
  flagDesc: { fontSize: 12, color: C.textSecondary, lineHeight: 18 },
  flagUser: { fontSize: 11, color: C.info, fontWeight: '700', marginTop: 6 },
  flagDate: { fontSize: 10, color: C.textMuted, marginTop: 3 },

  flagActionRow: { flexDirection: 'row', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  flagDismissBtn: { paddingVertical: 7, paddingHorizontal: 14, backgroundColor: C.surfaceUp, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  flagDismissText: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  flagWarnBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: C.warnBg, borderRadius: 8, borderWidth: 1, borderColor: C.warning + '44' },
  flagWarnText: { fontSize: 12, fontWeight: '700', color: C.warning },
  flagSuspendBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: C.dangerBg, borderRadius: 8, borderWidth: 1, borderColor: C.danger + '44' },
  flagSuspendText: { fontSize: 12, fontWeight: '700', color: C.danger },

  // ── Confirmation Modal ──
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  confirmCard: { backgroundColor: C.surface, borderRadius: 24, padding: 28, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: C.border, ...C.shadow },
  confirmIconRing: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  confirmTitle: { fontSize: 20, fontWeight: '900', color: C.textPrimary, textAlign: 'center', marginBottom: 10 },
  confirmMessage: { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  confirmActions: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: C.surfaceUp, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  confirmCancelText: { fontSize: 14, fontWeight: '700', color: C.textSecondary },
  confirmActionBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  confirmActionText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  // ── Modals Common ──
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  centerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  bottomSheet: { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, borderWidth: 1, borderColor: C.border, borderBottomWidth: 0 },
  sheetHandle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: C.textPrimary },
  sheetSub: { fontSize: 12, color: C.textMuted, marginTop: 3 },
  sheetModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },

  sheetProductHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 22, padding: 14, backgroundColor: C.surfaceUp, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  sheetProductIcon: { width: 60, height: 60, borderRadius: 14, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sheetStatChip: { backgroundColor: C.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  sheetStatText: { fontSize: 11, fontWeight: '700', color: C.textSecondary },

  disabledNotice: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.dangerBg, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.danger + '44' },
  disabledNoticeTitle: { fontSize: 14, fontWeight: '800', color: C.danger },
  disabledNoticeText: { fontSize: 12, color: C.danger, opacity: 0.8, marginTop: 2 },

  restoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.success, borderRadius: 14, paddingVertical: 15, marginBottom: 8 },
  restoreBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  disableBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.danger, borderRadius: 14, paddingVertical: 15, marginTop: 12 },
  disableBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  sheetCancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  sheetCancelText: { fontSize: 14, fontWeight: '700', color: C.textMuted },

  inputLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 1.5, marginBottom: 10, marginTop: 8 },
  reasonInput: { backgroundColor: C.surfaceUp, borderRadius: 12, padding: 14, fontSize: 14, color: C.textPrimary, height: 90, textAlignVertical: 'top', borderWidth: 1, borderColor: C.border },
  messageInput: { backgroundColor: C.surfaceUp, borderRadius: 12, padding: 14, fontSize: 14, color: C.textPrimary, height: 110, textAlignVertical: 'top', borderWidth: 1, borderColor: C.border },

  modalCard: { backgroundColor: C.surface, borderRadius: 24, padding: 24, width: '100%', borderWidth: 1, borderColor: C.border, ...C.shadow },
  modalCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  modalIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.warnBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.gold + '44' },
  modalCardTitle: { flex: 1, fontSize: 18, fontWeight: '900', color: C.textPrimary },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surfaceUp, alignItems: 'center', justifyContent: 'center' },

  priorityRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  priorityBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: C.surfaceUp, borderWidth: 1, borderColor: C.border },
  priorityText: { fontSize: 13, fontWeight: '700', color: C.textSecondary },

  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: C.surfaceUp, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: C.textSecondary },
  publishBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: C.indigo },
  publishBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  userModalTop: { alignItems: 'center', marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  userModalAvatar: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  userModalAvatarText: { fontSize: 28, fontWeight: '900' },
  userModalName: { fontSize: 20, fontWeight: '900', color: C.textPrimary, marginBottom: 8 },
  userModalMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  userModalRoleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  userModalRoleText: { fontSize: 11, fontWeight: '800' },
  userModalStore: { fontSize: 13, color: C.textMuted, fontWeight: '600' },
  violationBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: C.dangerBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: C.danger + '44' },
  violationBannerText: { fontSize: 12, color: C.danger, fontWeight: '800' },

  activityBox: { backgroundColor: C.surfaceUp, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  activityDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.indigoMid, marginTop: 5 },
  activityText: { fontSize: 12, color: C.textSecondary, lineHeight: 17 },
  activityTime: { fontSize: 10, color: C.textMuted, marginTop: 2 },

  userActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 14 },
  userActionBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // ── Unified Wizard ──
  wizardSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 16, paddingHorizontal: 20,
    height: height * 0.88,
    borderWidth: 1, borderColor: C.border, borderBottomWidth: 0,
  },
  wizardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  wizardIconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: C.warnBg, borderWidth: 1, borderColor: C.gold + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  wizardTitle: { fontSize: 18, fontWeight: '900', color: C.textPrimary },
  wizardSubtitle: { fontSize: 12, color: C.textMuted, marginTop: 1 },

  // Step progress track
  stepTrack: { flexDirection: 'row', alignItems: 'center', marginBottom: 28, paddingHorizontal: 4 },
  stepNodeWrap: { alignItems: 'center', gap: 6 },
  stepNode: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.surfaceUp, borderWidth: 2, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNodeActive: { borderColor: C.gold, backgroundColor: C.warnBg },
  stepNodeDone:   { borderColor: C.gold, backgroundColor: C.gold },
  stepNodeText: { fontSize: 13, fontWeight: '800', color: C.textMuted },
  stepLabel: { fontSize: 10, fontWeight: '700', color: C.textMuted, letterSpacing: 0.3 },
  stepLabelActive: { color: C.gold },
  stepLine: { flex: 1, height: 2, backgroundColor: C.border, marginBottom: 16, marginHorizontal: 6 },
  stepLineActive: { backgroundColor: C.gold },

  // Wizard body
  wizardBody: { flex: 1, overflow: 'hidden' },
  wizardStepHeading: { fontSize: 20, fontWeight: '900', color: C.textPrimary, marginBottom: 6 },
  wizardStepDesc: { fontSize: 13, color: C.textMuted, marginBottom: 20, lineHeight: 18 },

  wizardEmpty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  wizardEmptyText: { fontSize: 14, color: C.textMuted },

  // Person row (Step 1)
  wizardPersonRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surfaceUp, borderRadius: 16, padding: 14,
    marginBottom: 10, borderWidth: 1.5, borderColor: C.border,
  },
  wizardPersonRowActive: { borderColor: C.gold, backgroundColor: C.warnBg + '88' },
  wizardAvatar: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  wizardAvatarText: { fontSize: 18, fontWeight: '900' },
  wizardPersonName: { fontSize: 15, fontWeight: '800', color: C.textSecondary },
  wizardPersonMeta: { fontSize: 11, color: C.textMuted, marginTop: 3 },

  // Store row (Step 2)
  wizardStoreRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surfaceUp, borderRadius: 16, padding: 16,
    marginBottom: 10, borderWidth: 1.5, borderColor: C.border,
  },
  wizardStoreRowActive: { borderColor: C.gold, backgroundColor: C.warnBg + '88' },
  wizardStoreIconBox: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  wizardStoreName: { fontSize: 16, fontWeight: '800', color: C.textSecondary },
  wizardStoreMeta: { fontSize: 11, color: C.textMuted, marginTop: 3 },

  // Shared checkbox
  wizardCheckBox: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: C.border,
    backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center',
  },
  wizardCheckBoxActive: { backgroundColor: C.gold, borderColor: C.gold },

  // Step 3 — Review
  reviewHero: {
    backgroundColor: C.indigo, borderRadius: 18, padding: 24,
    alignItems: 'center', marginBottom: 20,
    borderWidth: 1, borderColor: C.indigoMid,
  },
  reviewHeroCount: { fontSize: 52, fontWeight: '900', color: C.gold, lineHeight: 58 },
  reviewHeroLabel: { fontSize: 14, fontWeight: '800', color: C.textPrimary, marginTop: 4 },
  reviewHeroSub: { fontSize: 12, color: C.textSecondary, marginTop: 4 },

  reviewSection: {
    backgroundColor: C.surfaceUp, borderRadius: 16,
    padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border,
  },
  reviewSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  reviewSectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, flex: 1 },
  reviewCountBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  reviewCountText: { fontSize: 11, fontWeight: '900' },
  reviewItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.border,
  },
  reviewDot: { width: 6, height: 6, borderRadius: 3 },
  reviewItemText: { flex: 1, fontSize: 14, fontWeight: '600', color: C.textSecondary },

  // Footer nav
  wizardFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.border,
  },
  wizardBackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: 14, backgroundColor: C.surfaceUp,
    borderWidth: 1, borderColor: C.border,
  },
  wizardBackText: { fontSize: 14, fontWeight: '700', color: C.textSecondary },
  wizardNextBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14, backgroundColor: C.gold,
  },
  wizardNextText: { fontSize: 14, fontWeight: '800', color: C.navy },
  wizardSendBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14, backgroundColor: C.gold,
  },
  wizardSendText: { fontSize: 14, fontWeight: '900', color: C.navy },

  // ── Empty / Common ──
  emptyState: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: C.textMuted, textAlign: 'center' },
});