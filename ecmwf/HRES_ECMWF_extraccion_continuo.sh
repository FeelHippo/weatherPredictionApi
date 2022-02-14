#!/bin/bash
HOY=`date '+%Y%m%d'`;
HORA=10#`date '+%H'`;
HORA=$(( ${HORA} - $((${HORA} % 12)) ))
printf -v HORA "%02d" ${HORA}
my_time=${HORA}00
my_date=`date -v-11d '+%Y%m%d'` ###HAY QUE RESTARLE 11 días para estar seguros de que tenemos acceso.
#year=${my_date:0:4}
#PATH_HRES="/LUSTRE/users/shared/ivillanueva/HRES/${year}/"

PATH_HRES="./"
PATH_ECMWF='./ecmwf/'

# this example will filter the area of interest (N/W/S/E) and interpolate the final fields to
# a 0.1x0.1 regular lat-lon grid (GRID=0.1/0.1)
AREA="45.8/-10.8/34.5/3.2"
GRID="0.1/0.1"

# fixed selection from the same block
PARAMS_HRES="246.228/247.228"
#PARAMS_ENS="246.228/247.228"
#PARAMS_HRES="21.228/164.128/165.128/166.128/167.128/168.128/169.128/246.228/247.228/134.128" #### Viento 246.228/247.228 y 10 metre U wind component, 10 metre V wind component, 100 metre U wind component, 100 metre V wind component, 2 metre dewpoint temperature, 2 metre temperature, Surface solar radiation downwards, Total cloud cover, Total sky direct solar radiation at surface preassure, pressure.

STEP="0/1/2/3/4/5/6/7/8/9/10/11/12/13/14/15/16/17/18/19/20/21/22/23/24/25/
26/27/28/29/30/31/32/33/34/35/36/37/38/39/40/41/42/43/44/45/46/47/48/49/50/
51/52/53/54/55/56/57/58/59/60/61/62/63/64/65/66/67/68/69/70/71/72/73/74/75/
76/77/78/79/80/81/82/83/84/85/86/87/88/89/90/93/96/99/102/105/108/111/114/
117/120/123/126/129/132/135/138/141/144/150/156/162/168/174/180/186/192/198/
204/210/216/222/228/234/240"

# Genero el fichero de llamada mars
cat << EOF > my_request_HRES_${my_date}_${my_time}.mars
RETRIEVE,
    CLASS      = OD,
    TYPE       = FC,
    STREAM     = OPER,
    EXPVER     = 0001,
    LEVTYPE    = SFC,
    GRID       = ${GRID},
    AREA       = ${AREA},
    PARAM      = ${PARAMS_HRES},
    DATE       = ${my_date},
    TIME       = ${my_time},
    STEP       = ${STEP},
    TARGET     = "${PATH_ECMWF}input.grib"
EOF

# Descargo los datos
mars my_request_HRES_${my_date}_${my_time}.mars
# Borra el fichero de llamada
if [ $? -eq 0 ]; then
  rm -f my_request_HRES_${my_date}_${my_time}.mars
fi
