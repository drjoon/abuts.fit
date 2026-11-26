//---------------------------------------------------------------------------

#ifndef MLTCCOMCTRLH
#define MLTCCOMCTRLH
//---------------------------------------------------------------------------
#include <string>

//---------------------------------------------------------------------------
 #define MODE_UM12 12

 #define SEN_READ  0
 #define SEN_WRITE 1

 #define SNAP_BTN_DOWN 0
 #define SNAP_BTN_UP   1
 //----------------For UM12---------------------------------------------------
 //UM12 remote control define
 //--------------------------------------------------------------------------------
 #define UM12_MOTOR_STATUS_WR            3
 #define UM12_LED_LEVEL_STATUS_WR        4
 #define UM12_AF_STATUS_WR               3
 //-----COMMAND ADDRESS DEFINE------------//
 #define UM12_ADDR_SADDR	0x00//register start address
 #define UM12_ADDR_STAFLAG      0x00//bottom limit switch failed flag bit[7], top limit switch failed flag bit[6], AF searching direction flag bit[4], remote control en/dis flag bit[3], AF start/stop flag bit[2], LED on/off flag bit[1], motor initial flag bit[0]
 #define UM12_ADDR_KEYCO	0x01//key code
 #define UM12_ADDR_KEYCH        0x02//key code checking
 #define UM12_ADDR_AFSTA        0x03//autofocus status
 #define UM12_ADDR_MTSTA        0x04//motor initial[7:6],motor status[5:0]
 #define UM12_ADDR_LEDMAX       0x05//led level maximum(brightness)
 #define UM12_ADDR_LEDLV        0x06//led level (brightness)
 #define UM12_ADDR_MAGNIH       0x07//magnification high byte
 #define UM12_ADDR_MAGNIL       0x08//magnification low byte
 #define UM12_ADDR_OPOSIH       0x09//optical position high byte
 #define UM12_ADDR_OPOSIL       0x0A//optical position low byte
 #define UM12_ADDR_ROUTEH       0x0B//total route high byte
 #define UM12_ADDR_ROUTEL       0x0C//total route low byte
 #define UM12_ADDR_LENSTYP      0x0D//lens type
 #define UM12_ADDR_AFAREA	0x0E//Autofocus range
 #define UM12_ADDR_LEDTYP       0x0F//Led type
 #define UM12_ADDR_LEDMOD       0x10//Led Mode
 #define UM12_ADDR_LENCIDX      0x11//Lens Correction Index
 #define UM12_ADDR_MOFFSET      0x12//Motor position offset
 #define UM12_ADDR_LENCCMD      0x13//Lens correction command for pccam ap

 #define UM12_ADDR_FWVER2	0x2D//version (LSB)
 #define UM12_ADDR_FWVER1	0x2E//version
 #define UM12_ADDR_FWVER0	0x2F//version (MSB)
 //-----KEY DEFINE---------------------------//
 #define UM12_KEY_SNAPSHOT              0x0A
 #define UM12_KEY_REMOTE_CTRL           0x0F
 #define UM12_KEY_OZOOMIN               0x10
 #define UM12_KEY_OZOOMOUT              0x11
 #define UM12_KEY_SZOOMIN          	0x12
 #define UM12_KEY_SZOOMOUT         	0x13
 #define UM12_KEY_AF_MANUAL             0x14
 #define UM12_KEY_AF_SINGLE             0x15
 #define UM12_KEY_AF_CONTINUE           0x16
 #define UM12_KEY_AF_START              0x17
 #define UM12_KEY_AF_STOP               0x18
 #define UM12_KEY_LED_ONOFF             0x19
 #define UM12_KEY_LED_INC               0x1A
 #define UM12_KEY_LED_DEC               0x1B
 #define UM12_KEY_BACK_FORTH_TEST       0x1C
 #define UM12_KEY_ROUTE_INIT            0x1D
 #define UM12_KEY_POSI_RESTORE          0x1E
 #define UM12_KEY_RETURN_ZERO		0x1F
 #define UM12_KEY_LENS_TYPE		0x20
 #define UM12_KEY_AF_AREA		0x21

 //-----LENS TYPE PARAMENTER DEFINE-----------//
 #define UM12_STEP_MAXIMUM       0x7A8

 #define UM12_FOCUS_AREA_01       0x00
 #define UM12_FOCUS_AREA_02       0x01
 #define UM12_FOCUS_AREA_03       0x02
 #define UM12_FOCUS_AREA_04       0x03
 #define UM12_FOCUS_AREA_05       0x04
 #define UM12_FOCUS_AREA_06       0x05
 #define UM12_FOCUS_AREA_07       0x06
 #define UM12_FOCUS_AREA_08       0x07
 #define UM12_FOCUS_AREA_09       0x08
 #define UM12_FOCUS_AREA_10       0x09
 #define UM12_FOCUS_AREA_11       0x0A
 #define UM12_FOCUS_AREA_12       0x0B
 #define UM12_FOCUS_AREA_13       0x0C
 #define UM12_FOCUS_AREA_14       0x0D
 #define UM12_FOCUS_AREA_15       0x0E
 #define UM12_FOCUS_AREA_16       0x0F
 #define UM12_FOCUS_AREA_17       0x10
 #define UM12_FOCUS_AREA_18       0x11
 #define UM12_FOCUS_AREA_19       0x12
 #define UM12_FOCUS_AREA_20       0x13
 #define UM12_FOCUS_AREA_21       0x14
 #define UM12_FOCUS_AREA_22       0x15
 #define UM12_FOCUS_AREA_23       0x16
 #define UM12_FOCUS_AREA_24       0x17
 #define UM12_FOCUS_AREA_25       0x18
 #define UM12_FOCUS_AREA_26       0x19
 #define UM12_FOCUS_AREA_ALL      0x1A
 #define UM12_FOCUS_AREA_LOCAL    0x1B

 //-----KEY EVENT DEFINE------------//
 #define UM12_KEY_NONE   0x00
 #define UM12_KEY_DOWN   (0x01<<6)//0x40
 #define UM12_KEY_UP     (0x02<<6)//0x80
 #define UM12_KEY_LONG   (0x03<<6)//0xC0

 #define DATA_NONE            0x00
 #define READ_DONE            0x00
 #define DEVCTRLBTN_UP        0
 #define DEVCTRLBTN_DOWN      1

 #define UM12_MAGNI_LOW 	1820//1860
 #define UM12_MAGNI_HIGH	1410//1460

 #define UM12_LED_MODE_MIN 0//Led mode min rang
 #define UM12_LED_MODE_MAX 7//Led mode max rang
 #define UM12_LED_MODE_DEF 0//default mode

 #define COM_MOTOR_OFFSET_MIN 0
 #define COM_MOTOR_OFFSET_DEF 127
 #define COM_MOTOR_OFFSET_MAX 255
 typedef unsigned long ULONG;

  bool  __declspec(dllexport) __stdcall ComInitial();
  void  __declspec(dllexport) __stdcall ComUnInitial();
  void  __declspec(dllexport) __stdcall wSetSendData_I2C(ULONG Command,ULONG  Data,short dev_mode);
  ULONG __declspec(dllexport) __stdcall rGetSendData_I2C(ULONG Command,short dev_mode);
//---------------------------------------------------------------------------
#endif
