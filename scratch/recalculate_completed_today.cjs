const fs = require("fs");

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

const configPath = "C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json";
const companyId = "rayba";
const targetDateStr = "2026-07-20";
const targetTimestamp = "2026-07-19T22:00:00Z";

async function run() {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const token = config.tokens.access_token;
    
    console.log("=== RECALCULATING COMPLETED WORKDAYS TODAY ===");
    
    // 1. Fetch completed workdays for today
    const url = "https://firestore.googleapis.com/v1/projects/ryb-limpiezas-app/databases/(default)/documents/companies/rayba:runQuery";
    const queryWorkdays = {
      "structuredQuery": {
        "from": [{ "collectionId": "workdays", "allDescendants": false }],
        "where": {
          "compositeFilter": {
            "op": "AND",
            "filters": [
              {
                "fieldFilter": {
                  "field": { "fieldPath": "date" },
                  "op": "EQUAL",
                  "value": { "timestampValue": targetTimestamp }
                }
              },
              {
                "fieldFilter": {
                  "field": { "fieldPath": "status" },
                  "op": "EQUAL",
                  "value": { "stringValue": "completed" }
                }
              }
            ]
          }
        }
      }
    };
    
    const wResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(queryWorkdays)
    });
    
    const wData = await wResponse.json();
    const completedWorkdays = wData.filter(item => item.document);
    
    console.log(`Found ${completedWorkdays.length} completed workdays.`);
    
    for (const wdItem of completedWorkdays) {
      const wdDoc = wdItem.document;
      const wdFields = wdDoc.fields;
      const userId = wdFields.userId.stringValue;
      const userName = wdFields.userName?.stringValue || "Operario";
      const carSessions = wdFields.carSessions?.arrayValue?.values || [];
      
      console.log(`Processing ${userName} (${userId})...`);
      
      // Calculate breadcrumbs distance
      let breadcrumbsKm = 0;
      let totalMeters = 0;
      carSessions.forEach(sessionVal => {
        const session = sessionVal.mapValue.fields;
        const breadcrumbs = session.breadcrumbs?.arrayValue?.values || [];
        if (breadcrumbs.length >= 2) {
          for (let i = 0; i < breadcrumbs.length - 1; i++) {
            const p1 = breadcrumbs[i].mapValue.fields;
            const p2 = breadcrumbs[i+1].mapValue.fields;
            if (p1.lat && p1.lng && p2.lat && p2.lng) {
              totalMeters += getDistance(
                parseFloat(p1.lat.doubleValue || p1.lat.integerValue),
                parseFloat(p1.lng.doubleValue || p1.lng.integerValue),
                parseFloat(p2.lat.doubleValue || p2.lat.integerValue),
                parseFloat(p2.lng.doubleValue || p2.lng.integerValue)
              );
            }
          }
        }
      });
      breadcrumbsKm = Math.round((totalMeters / 1000) * 100) / 100;
      console.log("Breadcrumbs distance (km):", breadcrumbsKm);
      
      // Get check-ins for the user today
      const queryCheckIns = {
        "structuredQuery": {
          "from": [{ "collectionId": "checkIns", "allDescendants": false }],
          "where": {
            "compositeFilter": {
              "op": "AND",
              "filters": [
                {
                  "fieldFilter": {
                    "field": { "fieldPath": "userId" },
                    "op": "EQUAL",
                    "value": { "stringValue": userId }
                  }
                },
                {
                  "fieldFilter": {
                    "field": { "fieldPath": "checkInTime" },
                    "op": "GREATER_THAN_OR_EQUAL",
                    "value": { "timestampValue": "2026-07-20T00:00:00Z" }
                  }
                },
                {
                  "fieldFilter": {
                    "field": { "fieldPath": "checkInTime" },
                    "op": "LESS_THAN_OR_EQUAL",
                    "value": { "timestampValue": "2026-07-20T23:59:59.999Z" }
                  }
                }
              ]
            }
          }
        }
      };
      
      const cResponse = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(queryCheckIns)
      });
      
      const cData = await cResponse.json();
      const checkIns = cData.filter(item => item.document).map(item => {
        const d = item.document;
        const fields = d.fields;
        return {
          id: d.name.split("/").pop(),
          communityId: fields.communityId?.stringValue,
          checkInTime: fields.checkInTime?.timestampValue,
          checkOutTime: fields.checkOutTime?.timestampValue,
          lat: fields.checkInLocation?.mapValue?.fields?.latitude?.doubleValue || fields.lat?.doubleValue || 0,
          lng: fields.checkInLocation?.mapValue?.fields?.longitude?.doubleValue || fields.lng?.doubleValue || 0
        };
      });
      
      console.log(`Found ${checkIns.length} check-ins for today.`);
      
      // Let's sort check-ins chronologically
      checkIns.sort((a, b) => new Date(a.checkInTime).getTime() - new Date(b.checkInTime).getTime());
      
      // Calculate distances between consecutive check-ins (tramos)
      const tramos = [];
      let calculatedKm = 0;
      
      // Fetch communities to get coordinates
      const communityCache = {};
      const getCommunityCoords = async (commId) => {
        if (communityCache[commId]) return communityCache[commId];
        const commUrl = `https://firestore.googleapis.com/v1/projects/ryb-limpiezas-app/databases/(default)/documents/companies/rayba/communities/${commId}`;
        const commRes = await fetch(commUrl, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (!commRes.ok) return { lat: 0, lng: 0, name: "Comunidad" };
        const commData = await commRes.json();
        const latVal = commData.fields?.location?.mapValue?.fields?.latitude?.doubleValue || commData.fields?.location?.mapValue?.fields?._lat?.doubleValue || 0;
        const lngVal = commData.fields?.location?.mapValue?.fields?.longitude?.doubleValue || commData.fields?.location?.mapValue?.fields?._long?.doubleValue || 0;
        const nameVal = commData.fields?.name?.stringValue || "Comunidad";
        communityCache[commId] = { lat: latVal, lng: lngVal, name: nameVal };
        return communityCache[commId];
      };
      
      for (let i = 0; i < checkIns.length - 1; i++) {
        const c1 = checkIns[i];
        const c2 = checkIns[i+1];
        
        const comm1 = await getCommunityCoords(c1.communityId);
        const comm2 = await getCommunityCoords(c2.communityId);
        
        const dist = getDistance(comm1.lat, comm1.lng, comm2.lat, comm2.lng);
        const kmLineaRecta = Math.round((dist / 1000) * 100) / 100;
        const kmEstimados = Math.round(kmLineaRecta * 1.3 * 100) / 100;
        
        const salida = new Date(c1.checkOutTime || c1.checkInTime);
        const llegada = new Date(c2.checkInTime);
        const diffMin = Math.round((llegada.getTime() - salida.getTime()) / 60000);
        
        calculatedKm += kmEstimados;
        
        tramos.push({
          mapValue: {
            fields: {
              origenId: { stringValue: c1.communityId },
              origenNombre: { stringValue: comm1.name },
              origenCoords: {
                mapValue: {
                  fields: {
                    lat: { doubleValue: comm1.lat },
                    lng: { doubleValue: comm1.lng }
                  }
                }
              },
              destinoId: { stringValue: c2.communityId },
              destinoNombre: { stringValue: comm2.name },
              destinoCoords: {
                mapValue: {
                  fields: {
                    lat: { doubleValue: comm2.lat },
                    lng: { doubleValue: comm2.lng }
                  }
                }
              },
              horaSalida: { timestampValue: c1.checkOutTime || c1.checkInTime },
              horaLlegada: { timestampValue: c2.checkInTime },
              kmLineaRecta: { doubleValue: kmLineaRecta },
              kmEstimados: { doubleValue: kmEstimados },
              minutosDesplazamiento: { integerValue: diffMin.toString() },
              sospechoso: { booleanValue: false },
              mismoCentro: { booleanValue: c1.communityId === c2.communityId }
            }
          }
        });
      }
      
      const finalKm = Math.max(breadcrumbsKm, calculatedKm);
      console.log(`Calculated km: ${calculatedKm}, final km: ${finalKm}`);
      
      // Save dailyMileage document!
      const postUrl = "https://firestore.googleapis.com/v1/projects/ryb-limpiezas-app/databases/(default)/documents/companies/rayba/dailyMileage";
      const docData = {
        fields: {
          userId: { stringValue: userId },
          userName: { stringValue: userName },
          date: { timestampValue: targetTimestamp },
          dateStr: { stringValue: targetDateStr },
          totalKm: { doubleValue: finalKm },
          tramosSospechosos: { integerValue: "0" },
          totalTramos: { integerValue: tramos.length.toString() },
          type: { stringValue: "auto" },
          tramos: {
            arrayValue: {
              values: tramos
            }
          },
          createdAt: { timestampValue: new Date().toISOString() },
          updatedAt: { timestampValue: new Date().toISOString() }
        }
      };
      
      const pResponse = await fetch(postUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(docData)
      });
      
      if (pResponse.ok) {
        console.log(`SUCCESS: Saved dailyMileage for ${userName}`);
      } else {
        const text = await pResponse.text();
        console.error(`FAILED to save dailyMileage for ${userName}:`, text);
      }
    }
    
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
