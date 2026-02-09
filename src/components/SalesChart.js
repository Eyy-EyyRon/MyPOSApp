import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Dimensions, LayoutAnimation } from "react-native";
import { Canvas, Path, LinearGradient, vec, Skia } from "@shopify/react-native-skia";
import * as d3 from "d3-shape";
import * as scale from "d3-scale";

const SalesChart = ({ data }) => {
  // Use a state for width so it adjusts to parent container
  const [width, setWidth] = useState(0);
  const height = 180;
  const verticalMargin = 10;

  // Handle layout to get exact parent width
  const onLayout = (event) => {
    setWidth(event.nativeEvent.layout.width);
  };

  if (width === 0) {
    return <View style={{ height: 220, width: '100%' }} onLayout={onLayout} />;
  }

  // --- CHART LOGIC ---
  const chartData = data && data.length > 0 ? data : [0, 0, 0, 0, 0];
  
  // X Scale: Distribute points evenly across the width
  const xDomain = chartData.map((_, index) => index);
  const xRange = [10, width - 10]; // 10px padding inside canvas
  const scaleX = scale.scalePoint().domain(xDomain).range(xRange).padding(0);

  // Y Scale: Map values to height
  const maxVal = Math.max(...chartData);
  const yDomain = [0, maxVal === 0 ? 100 : maxVal * 1.2]; // Avoid divide by zero
  const yRange = [height - verticalMargin, verticalMargin];
  const scaleY = scale.scaleLinear().domain(yDomain).range(yRange);

  // Generate Paths
  const lineGenerator = d3.line()
    .x((_, index) => scaleX(index))
    .y((value) => scaleY(value))
    .curve(d3.curveCatmullRom); 

  const areaGenerator = d3.area()
    .x((_, index) => scaleX(index))
    .y0(height)
    .y1((value) => scaleY(value))
    .curve(d3.curveCatmullRom);

  const pathString = lineGenerator(chartData);
  const areaString = areaGenerator(chartData);

  const skiaPath = Skia.Path.MakeFromSVGString(pathString);
  const skiaAreaPath = Skia.Path.MakeFromSVGString(areaString);

  return (
    <View style={styles.container} onLayout={onLayout}>
      <View style={styles.header}>
        <Text style={styles.title}>Weekly Sales Performance</Text>
        <Text style={styles.subtitle}>Last 7 Days</Text>
      </View>

      <Canvas style={{ width: width, height: height }}>
        <Path path={skiaAreaPath} color="rgba(19, 15, 95, 0.2)">
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={["rgba(19, 15, 95, 0.2)", "rgba(19, 15, 95, 0)"]} 
          />
        </Path>
        <Path 
          path={skiaPath} 
          style="stroke" 
          strokeWidth={3} 
          color="#130f5f" 
          strokeCap="round" 
          strokeJoin="round"
        />
      </Canvas>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%', // ✅ FIXED: Takes full width of parent
    marginBottom: 10,
  },
  header: {
    marginBottom: 15,
    paddingHorizontal: 5, // Small padding to ensure text isn't flush with edge
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#111827",
  },
  subtitle: {
    fontSize: 12,
    color: "#6B7280",
  },
});

export default SalesChart;