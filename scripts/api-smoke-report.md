# API smoke report

Backend: `http://localhost:8080`
Admin login: `(set ADMIN_EMAIL env)`
Generated: 2026-05-21T13:37:29.245Z

**Totals:** PASS 30 · WARN 13 · FAIL 0 · total 43

## auth

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| WARN | 401 | GET | `/api/v1/user/role` | {"message":"unauthorized","data":null} |
| PASS | 200 | GET | `/api/v1/profile` | {"message":"Profile fetched successfully","data":{"name":"[Admin User]","email":"[user]@webknot.in"… |
| PASS | 302 | GET | `/api/v1/google-signin` |  |

## users

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| PASS | 200 | GET | `/api/v1/user/onboard` | {"message":"all onboarded users fetched successfully","data":{"totalElement":5,"… |
| PASS | 200 | GET | `/api/v1/employees` | {"message":"Employee profiles fetched successfully","data":{"totalElement":4,"to… |
| PASS | 200 | GET | `/api/v1/user/get-email-name` | {"message":"success","data":[{"name":"[Admin User]","email":"[user]@webknot.in"}… |
| PASS | 200 | GET | `/api/v1/client-proj-status` | {"message":"success","data":{"status":false}} |

## designations

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| WARN | 404 | GET | `/api/v1/designations` | {"timestamp":"2026-05-21T13:37:29.049+00:00","status":404,"error":"Not Found","message":"No message available","path":"/api/v1/designations"} |

## bands

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| PASS | 200 | GET | `/api/v1/band-list` | {"message":"bands fetched successfully","data":{"totalElement":4,"totalPage":1,"… |
| WARN | 404 | GET | `/api/v1/departments` | {"timestamp":"2026-05-21T13:37:29.058+00:00","status":404,"error":"Not Found","message":"No message available","path":"/api/v1/departments"} |
| WARN | 404 | GET | `/api/v1/streams` | {"timestamp":"2026-05-21T13:37:29.063+00:00","status":404,"error":"Not Found","message":"No message available","path":"/api/v1/streams"} |

## kpi

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| PASS | 200 | GET | `/api/v1/kpi-definitions` | {"message":"Fetched all KPI definitions","data":[]} |
| PASS | 200 | GET | `/api/v1/list-kpi-definitions` | {"message":"Fetched all KPI definitions","data":[]} |

## webknot

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| WARN | 404 | GET | `/api/v1/webknot-values` | {"timestamp":"2026-05-21T13:37:29.075+00:00","status":404,"error":"Not Found","message":"No message available","path":"/api/v1/webknot-values"} |
| WARN | 404 | GET | `/api/v1/webknot-value` | {"timestamp":"2026-05-21T13:37:29.079+00:00","status":404,"error":"Not Found","message":"No message available","path":"/api/v1/webknot-value"} |

## settings

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| PASS | 200 | GET | `/api/v1/settings` | {"message":"Fetched settings","data":[]} |
| PASS | 200 | GET | `/api/v1/list-settings` | {"message":"Fetched settings","data":[]} |

## cycles

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| PASS | 200 | GET | `/api/v1/submission-cycles` | {"message":"Fetched all submission cycles","data":[]} |
| PASS | 200 | GET | `/api/v1/list-submission-cycles` | {"message":"Fetched all submission cycles","data":[]} |
| PASS | 400 | GET | `/api/v1/resolve-submission-cycle` | {"message":"Required request parameter 'cycleKey' for method parameter type Stri… |

## projects

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| WARN | 403 | GET | `/api/v1/projects` | {"message":"Access denied. Only HR can access this resource.","data":null} |
| WARN | 403 | GET | `/api/v1/manager-projects` | {"message":"Access denied Only MANAGER can access this resource.","data":null} |
| WARN | 403 | GET | `/api/v1/manager-projects-with-roles` | {"message":"Access denied. Only MANAGER can access this resource.","data":null} |
| PASS | 200 | GET | `/api/v1/project-assigned-to-user` | {"message":"success","data":[]} |
| PASS | 200 | GET | `/api/v1/manager/allocation-ending-soon` | {"message":"success","data":{"totalElement":0,"totalPage":0,"currentPage":0,"pag… |

## alloc

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| WARN | 403 | GET | `/api/v1/allocation` | {"message":"Access denied. Only HR can access this resource.","data":null} |
| PASS | 200 | GET | `/api/v1/allocation/user` | {"message":"success","data":[]} |
| WARN | 400 | GET | `/api/v1/allocation/forecasting` | {"message":"Required request parameter 'days' for method parameter type int is not present","data":null} |
| PASS | 200 | GET | `/api/v1/allocation/roles` | {"message":"success","data":{}} |

## alloc-ext

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| PASS | 200 | GET | `/api/v1/allocation-extension-request` | {"message":"success","data":{"totalElement":0,"totalPage":0,"currentPage":0,"pag… |
| WARN | 403 | GET | `/api/v1/manager/allocation-extension-status` | {"timestamp":"2026-05-21T13:37:29.146+00:00","status":403,"error":"Forbidden","message":"Forbidden","path":"/api/v1/manager/allocation-extension-status"} |

## user-req

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| PASS | 200 | GET | `/api/v1/user-requests/managers` | {"message":"success","data":[]} |
| PASS | 200 | GET | `/api/v1/userRequest/managers` | {"message":"success","data":[]} |

## leave

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| PASS | 403 | GET | `/api/v1/leave-summary` | {"timestamp":"2026-05-21T13:37:29.161+00:00","status":403,"error":"Forbidden","m… |

## cron

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| PASS | 200 | GET | `/api/v1/reminder` | {"message":"Reminder sent to pending managers","data":null} |
| PASS | 200 | GET | `/api/v1/run-monthly-leave-cron` |  |

## notif

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| PASS | 200 | GET | `/api/v1/notifications/0` | [] |

## crud

| status | code | method | path | note |
| --- | --- | --- | --- | --- |
| PASS | 201 | POST | `/api/v1/settings` | {"message":"Created setting","data":{"id":2,"key":"smoke_test_1779370649193","va… |
| PASS | 200 | GET | `/api/v1/settings/smoke_test_1779370649193` | {"message":"Fetched setting","data":{"id":2,"key":"smoke_test_1779370649193","va… |
| PASS | 200 | PUT | `/api/v1/settings/smoke_test_1779370649193` | {"message":"Updated setting","data":{"id":2,"key":"smoke_test_1779370649193","va… |
| PASS | 200 | PATCH | `/api/v1/settings/smoke_test_1779370649193` | {"message":"Patched setting","data":{"id":2,"key":"smoke_test_1779370649193","va… |
| PASS | 200 | DELETE | `/api/v1/settings/smoke_test_1779370649193` | {"message":"Deleted setting","data":"smoke_test_1779370649193"} |
| WARN | 404 | POST | `/api/v1/webknot-values` | {"timestamp":"2026-05-21T13:37:29.244+00:00","status":404,"error":"Not Found","message":"No message available","path":"/api/v1/webknot-values"} |
