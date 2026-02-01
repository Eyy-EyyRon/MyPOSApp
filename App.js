import React, { useEffect, useState, useRef } from 'react';
import { 
  View, Text, StyleSheet, ActivityIndicator, Platform, Alert, Animated, SafeAreaView, TouchableOpacity 
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

// --- SCREENS ---
import AuthScreen from './src/screens/AuthScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import ManagerScreen from './src/screens/ManagerScreen';
import MerchantScreen from './src/screens/MerchantScreen';
import SalesScreen from './src/screens/SalesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OwnerScreen from './src/screens/OwnerScreen'; 
import { supabase } from './src/lib/supabase';

const Tab = createBottomTabNavigator();
const COLORS = { primary: '#130f5f', dark: '#111827', success: '#10B981', white: '#FFF' };

// --- CUSTOM NOTIFICATION COMPONENT ---
const NotificationBanner = ({ message, visible, onClose }) => {
  const slideAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (visible) {
      // Slide Down
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Auto Hide after 4 seconds
      const timer = setTimeout(() => {
        closeBanner();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const closeBanner = () => {
    Animated.timing(slideAnim, {
      toValue: -150,
      duration: 300,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  if (!visible) return null;

  return (
    <Animated.View style={[styles.notificationWrapper, { transform: [{ translateY: slideAnim }] }]}>
      <SafeAreaView>
        <TouchableOpacity style={styles.notificationContent} onPress={closeBanner} activeOpacity={0.9}>
          <View style={styles.iconCircle}>
            <Ionicons name="cash" size={24} color={COLORS.success} />
          </View>
          <View style={{flex: 1}}>
            <Text style={styles.notifTitle}>New Sale! 💰</Text>
            <Text style={styles.notifBody}>{message}</Text>
          </View>
          <Ionicons name="close" size={20} color="#999" />
        </TouchableOpacity>
      </SafeAreaView>
    </Animated.View>
  );
};

export default function App() {
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [appIsReady, setAppIsReady] = useState(false); 
  
  // Notification State
  const [notifVisible, setNotifVisible] = useState(false);
  const [notifMessage, setNotifMessage] = useState("");

  useEffect(() => {
    // 1. LISTEN FOR AUTH CHANGES
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id);
      else setAppIsReady(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setAppIsReady(false);
        fetchUserRole(session.user.id);
      } else {
        setUserRole(null);
        setAppIsReady(true);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // --- 2. REAL-TIME LISTENER FOR SALES ---
  useEffect(() => {
    // Only listen if user is a MANAGER and has notifications ON
    if (!userRole || userRole.role !== 'manager' || userRole.notifications_enabled === false) return;

    console.log("🔔 Listening for sales at:", userRole.store_name);

    const subscription = supabase
      .channel('public:sales')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, (payload) => {
        
        // Check if the sale belongs to THIS manager's store
        if (payload.new.store_name === userRole.store_name) {
          triggerInAppNotification(
            `Received ₱${payload.new.total_amount} from ${payload.new.cashier_name}`
          );
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [userRole]); 

  // --- HELPER: SHOW BANNER ---
  const triggerInAppNotification = (message) => {
    setNotifMessage(message);
    setNotifVisible(true);
  };

  const fetchUserRole = async (userId) => {
    try {
      console.log("App.js: Fetching Profile...");
      const { data, error } = await supabase
        .from('profiles')
        .select('*') 
        .eq('id', userId)
        .single();
      
      if (data) {
        setUserRole(data);
      }
    } catch (e) {
      console.log("App.js: Fetch Exception", e);
    } finally {
      setAppIsReady(true);
    }
  };

  const handlePasswordUpdateComplete = () => {
    if (session?.user?.id) fetchUserRole(session.user.id);
  };

  // --- RENDER LOGIC ---
  if (!appIsReady) {
    return (
      <View style={styles.splashContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // --- MAIN APP CONTENT ---
  const renderContent = () => {
    if (!session) return <AuthScreen />;
    if (userRole?.status === 'banned') return <AuthScreen isBanned={true} />; 
    if (userRole?.must_change_password) return <ChangePasswordScreen onPasswordChanged={handlePasswordUpdateComplete} />;
    if (!userRole) return <View style={styles.splashContainer}><ActivityIndicator size="large" color="red" /></View>;

    const isOwner = userRole?.role === 'owner';
    const isManager = userRole?.role === 'manager';

    return (
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarIcon: ({ focused, color, size }) => {
              let iconName;
              if (route.name === 'POS') iconName = focused ? 'calculator' : 'calculator-outline';
              else if (route.name === 'Inventory') iconName = focused ? 'briefcase' : 'briefcase-outline';
              else if (route.name === 'Sales') iconName = focused ? 'bar-chart' : 'bar-chart-outline';
              else if (route.name === 'Admin') iconName = focused ? 'shield' : 'shield-outline';
              else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';
              return <Ionicons name={iconName} size={size} color={color} />;
            },
            tabBarActiveTintColor: COLORS.primary,
            tabBarInactiveTintColor: 'gray',
            tabBarStyle: { paddingBottom: 5, height: 60 },
          })}
        >
          {isOwner ? (
            <>
              <Tab.Screen name="Admin" component={OwnerScreen} />
              <Tab.Screen name="Settings" component={SettingsScreen} />
            </>
          ) : (
            <>
              <Tab.Screen name="POS">
                {() => <MerchantScreen user={userRole} />}
              </Tab.Screen>

              {isManager && (
                <>
                  <Tab.Screen name="Inventory" component={ManagerScreen} />
                  <Tab.Screen name="Sales" component={SalesScreen} />
                </>
              )}
              <Tab.Screen name="Settings" component={SettingsScreen} />
            </>
          )}
        </Tab.Navigator>
      </NavigationContainer>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {renderContent()}
      
      {/* GLOBAL NOTIFICATION COMPONENT */}
      <NotificationBanner 
        visible={notifVisible} 
        message={notifMessage} 
        onClose={() => setNotifVisible(false)} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  splashContainer: { flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  
  // Notification Styles
  notificationWrapper: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 9999, // Stays on top of everything
    paddingTop: Platform.OS === 'android' ? 40 : 0, // Handle notch
  },
  notificationContent: {
    margin: 15,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
    borderLeftWidth: 5,
    borderLeftColor: COLORS.success
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#DEF7EC',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 15
  },
  notifTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    color: COLORS.dark,
    marginBottom: 2
  },
  notifBody: {
    color: '#555',
    fontSize: 14
  }
});