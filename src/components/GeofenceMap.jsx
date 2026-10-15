import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Modern custom icons using SVG and CSS
const createCenterIcon = (name) =>
  L.divIcon({
    className: "custom-map-icon-wrap",
    html: `
      <div class="map-pin institution-pin" title="${name || "Geofence Center"}">
        <span class="pin-icon">📍</span>
      </div>
    `,
    iconSize: [36, 42],
    iconAnchor: [18, 40],
    popupAnchor: [0, -38],
  });

const createStudentIcon = (isInside) =>
  L.divIcon({
    className: "custom-map-icon-wrap",
    html: `
      <div class="student-marker-beacon ${isInside ? "inside" : "outside"}">
        <div class="beacon-pulse"></div>
        <div class="beacon-core"></div>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });

function GeofenceMap({
  centerLat = 26.1445,
  centerLng = 91.7362,
  radius = 400,
  studentLat = null,
  studentLng = null,
  gpsAccuracy = null,
  locationName = "Geofence Zone",
  interactive = false,
  onLocationChange = null,
  height = "340px",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const centerMarkerRef = useRef(null);
  const geofenceCircleRef = useRef(null);
  const studentMarkerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const polylineRef = useRef(null);

  const validCenterLat = Number.isFinite(Number(centerLat)) ? Number(centerLat) : 26.1445;
  const validCenterLng = Number.isFinite(Number(centerLng)) ? Number(centerLng) : 91.7362;
  const validRadius = Math.max(10, Number(radius) || 400);

  const hasStudentPos =
    studentLat !== null &&
    studentLng !== null &&
    Number.isFinite(Number(studentLat)) &&
    Number.isFinite(Number(studentLng));

  const initialConfigRef = useRef({
    lat: validCenterLat,
    lng: validCenterLng,
    radius: validRadius,
    name: locationName,
  });

  // 1. Initialize map on mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const { lat, lng, radius: initRadius, name: initName } = initialConfigRef.current;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 16,
      zoomControl: true,
      scrollWheelZoom: false, // Avoid accidental page scroll traps
      attributionControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // Initial boundary circle
    const circle = L.circle([lat, lng], {
      radius: initRadius,
      color: "#2563eb",
      weight: 2,
      fillColor: "#3b82f6",
      fillOpacity: 0.16,
      dashArray: "4, 6",
    }).addTo(map);

    // Initial center marker
    const centerMarker = L.marker([lat, lng], {
      icon: createCenterIcon(initName),
    })
      .addTo(map)
      .bindPopup(`<strong>${initName}</strong><br/>Permitted Radius: ${initRadius}m`);

    mapRef.current = map;
    geofenceCircleRef.current = circle;
    centerMarkerRef.current = centerMarker;

    // Handle map container resizing
    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Handle interactive map clicks (Admin mode to pick new location)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function handleClick(e) {
      if (interactive && onLocationChange) {
        onLocationChange({
          latitude: Number(e.latlng.lat.toFixed(6)),
          longitude: Number(e.latlng.lng.toFixed(6)),
        });
      }
    }

    if (interactive) {
      map.on("click", handleClick);
    } else {
      map.off("click", handleClick);
    }

    return () => {
      map.off("click", handleClick);
    };
  }, [interactive, onLocationChange]);

  // 3. Update geofence center & radius dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const centerLatLng = [validCenterLat, validCenterLng];

    if (centerMarkerRef.current) {
      centerMarkerRef.current.setLatLng(centerLatLng);
      centerMarkerRef.current.setPopupContent(
        `<strong>${locationName}</strong><br/>Permitted Radius: ${validRadius}m`
      );
    }

    if (geofenceCircleRef.current) {
      geofenceCircleRef.current.setLatLng(centerLatLng);
      geofenceCircleRef.current.setRadius(validRadius);
    }

    if (!hasStudentPos) {
      map.setView(centerLatLng, map.getZoom() || 16, { animate: true });
    }
  }, [validCenterLat, validCenterLng, validRadius, locationName, hasStudentPos]);

  // 4. Update student position, accuracy circle, and distance line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (hasStudentPos) {
      const studentLatLng = [Number(studentLat), Number(studentLng)];
      const centerLatLng = [validCenterLat, validCenterLng];

      // Calculate distance directly using Leaflet geometry
      const distance = map.distance(centerLatLng, studentLatLng);
      const isInside = distance <= validRadius;

      // Student marker
      if (!studentMarkerRef.current) {
        studentMarkerRef.current = L.marker(studentLatLng, {
          icon: createStudentIcon(isInside),
          zIndexOffset: 1000,
        }).addTo(map);
      } else {
        studentMarkerRef.current.setLatLng(studentLatLng);
        studentMarkerRef.current.setIcon(createStudentIcon(isInside));
      }

      studentMarkerRef.current.bindPopup(
        `<strong>Your Reported Location</strong><br/>` +
        `Distance to center: <b>${Math.round(distance)}m</b><br/>` +
        `Status: <span style="color:${isInside ? "#16a34a" : "#dc2626"}; font-weight:700;">${
          isInside ? "✓ Inside Geofence" : "✕ Outside Geofence"
        }</span>`
      );

      // Student accuracy circle
      if (gpsAccuracy && Number(gpsAccuracy) > 0) {
        if (!accuracyCircleRef.current) {
          accuracyCircleRef.current = L.circle(studentLatLng, {
            radius: Number(gpsAccuracy),
            color: "#64748b",
            weight: 1,
            fillColor: "#94a3b8",
            fillOpacity: 0.12,
            dashArray: "2, 4",
          }).addTo(map);
        } else {
          accuracyCircleRef.current.setLatLng(studentLatLng);
          accuracyCircleRef.current.setRadius(Number(gpsAccuracy));
        }
      } else if (accuracyCircleRef.current) {
        accuracyCircleRef.current.remove();
        accuracyCircleRef.current = null;
      }

      // Connecting guide line
      if (!polylineRef.current) {
        polylineRef.current = L.polyline([centerLatLng, studentLatLng], {
          color: isInside ? "#16a34a" : "#dc2626",
          weight: 2.5,
          dashArray: "6, 6",
          opacity: 0.8,
        }).addTo(map);
      } else {
        polylineRef.current.setLatLngs([centerLatLng, studentLatLng]);
        polylineRef.current.setStyle({
          color: isInside ? "#16a34a" : "#dc2626",
        });
      }

      // Smoothly fit bounds to encompass both the geofence perimeter and student position
      const bounds = L.latLngBounds([
        centerLatLng,
        studentLatLng,
        geofenceCircleRef.current.getBounds().getNorthEast(),
        geofenceCircleRef.current.getBounds().getSouthWest(),
      ]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17, animate: true });
    } else {
      // Clear student layers if no student location
      if (studentMarkerRef.current) {
        studentMarkerRef.current.remove();
        studentMarkerRef.current = null;
      }
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.remove();
        accuracyCircleRef.current = null;
      }
      if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }
    }
  }, [hasStudentPos, studentLat, studentLng, validCenterLat, validCenterLng, validRadius, gpsAccuracy]);

  return (
    <div className="geofence-map-container" style={{ position: "relative", width: "100%", height }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "14px",
          overflow: "hidden",
          border: "1px solid #cbd5e1",
          background: "#f1f5f9",
          zIndex: 1,
        }}
      />

      {interactive && (
        <div className="map-interactive-banner">
          <span>👆 Click anywhere on the map to set geofence coordinates</span>
        </div>
      )}

      <div className="map-legend-overlay">
        <div className="legend-item">
          <span className="legend-dot center-dot"></span>
          <span>Boundary ({validRadius}m)</span>
        </div>
        {hasStudentPos && (
          <div className="legend-item">
            <span className="legend-dot student-dot"></span>
            <span>Your GPS position</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default GeofenceMap;
