#pragma once
#include <Arduino.h>
struct SensorReading {
  float capacityL, volumeL, flowLmin, panelV, panelA;
  bool valid, emergencyOk, minimumOk, currentOk, solarOk, canStart;
};
// Implement boardBegin(), drivePump(bool) and readSensors() after hardware
// characterization. A normally-open power stage and independent hard stop
// must keep the motor off while the MCU is unpowered or resetting.
#if __has_include("board_private.h")
#include "board_private.h"
#else
inline void boardBegin() {}
inline void drivePump(bool) {}
inline SensorReading readSensors() { return {}; }
#endif
