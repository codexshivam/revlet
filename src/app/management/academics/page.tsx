"use client"

import { useState } from "react"
import Link from "next/link"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Loader2, BookOpen, Plus, Trash2, Library, Users, ArrowRight, AlertTriangle, ShieldCheck } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAcademicClasses } from "@/hooks/use-academic-classes"
import { useActiveOrg } from "@/hooks/use-active-org"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export default function AcademicsManagementPage() {
  const { toast } = useToast()
  const { activeOrg, loading: isLoadingOrg } = useActiveOrg()
  const { classes, isLoading: isLoadingClasses, createClass, deleteClass, addSection, removeSection } = useAcademicClasses()

  const isWorkspaceActive = activeOrg?.workspaceStatus === "active"

  // Creation Engine State
  const [newClassName, setNewClassName] = useState("")
  const [isCreatingClass, setIsCreatingClass] = useState(false)

  const [selectedClassId, setSelectedClassId] = useState<string>("")
  const [newSectionName, setNewSectionName] = useState("")
  const [isCreatingSection, setIsCreatingSection] = useState(false)

  // Deletion State
  const [classToDelete, setClassToDelete] = useState<string | null>(null)
  const [sectionToDelete, setSectionToDelete] = useState<{ classId: string, sectionId: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClassName.trim()) return

    setIsCreatingClass(true)
    try {
      await createClass(newClassName.trim())
      toast({
        title: "Class Created",
        description: `Successfully created class "${newClassName}" in Google Workspace.`,
      })
      setNewClassName("")
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to create class",
        description: err.message || "An error occurred.",
      })
    } finally {
      setIsCreatingClass(false)
    }
  }

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClassId || !newSectionName.trim()) return

    setIsCreatingSection(true)
    try {
      await addSection(selectedClassId, newSectionName.trim())
      toast({
        title: "Section Added",
        description: `Successfully added section "${newSectionName}" to "${selectedClassId}".`,
      })
      setNewSectionName("")
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to add section",
        description: err.message || "An error occurred.",
      })
    } finally {
      setIsCreatingSection(false)
    }
  }

  const handleDeleteClass = async () => {
    if (!classToDelete) return
    setIsDeleting(true)
    try {
      await deleteClass(classToDelete)
      toast({
        title: "Class Deleted",
        description: `Permanently removed class "${classToDelete}" from Google Workspace.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: err.message,
      })
    } finally {
      setIsDeleting(false)
      setClassToDelete(null)
    }
  }

  const handleDeleteSection = async () => {
    if (!sectionToDelete) return
    setIsDeleting(true)
    try {
      await removeSection(sectionToDelete.classId, sectionToDelete.sectionId)
      toast({
        title: "Section Removed",
        description: `Successfully removed section "${sectionToDelete.sectionId}".`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: err.message,
      })
    } finally {
      setIsDeleting(false)
      setSectionToDelete(null)
    }
  }

  // ─── STATE 1: Org Loading or Classes Loading ────────────────────────────────

  if (isLoadingOrg || (isWorkspaceActive && isLoadingClasses)) {
    return (
      <DashboardShell className="max-w-[1400px]">
        <div className="space-y-8 animate-pulse">
          {/* Header Skeleton */}
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-6">
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="h-9 w-64 bg-slate-200 rounded mt-1" />
            <div className="h-4 w-full max-w-2xl bg-slate-200 rounded mt-2" />
          </div>

          <div className="space-y-8">
            <div className="h-[200px] bg-slate-100 rounded-xl border border-slate-200" />
            <div className="h-[500px] bg-slate-50 rounded-xl border border-slate-200" />
          </div>
        </div>
      </DashboardShell>
    )
  }

  // ─── STATE 2: Google Workspace Required ────────────────────────────────────

  if (!isWorkspaceActive) {
    return (
      <DashboardShell>
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="flex flex-col gap-1 border-b border-slate-200 pb-6">
            <h1 className="text-3xl font-headline font-bold text-slate-900">Academic Organization</h1>
          </div>
          <div className="max-w-4xl mx-auto py-20 animate-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-slate-50 border-slate-200 border-dashed shadow-sm">
              <CardContent className="p-16 flex flex-col items-center text-center gap-6">
                <div className="p-4 bg-white rounded-full border border-slate-100 shadow-sm shrink-0">
                  <Library className="w-10 h-10 text-slate-300 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-headline font-bold text-slate-900">Google Workspace Connection Required</h3>
                  <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed font-medium">
                    Classes and Sections are managed directly within Google Workspace under `/Students`. Please activate your Google Workspace connection first.
                  </p>
                </div>
                <Link href="/services/workspace">
                  <Button className="font-bold gap-2 h-11 px-6 bg-slate-900 hover:bg-black text-white transition-all shadow-md">
                    Go to Workspace Setup
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardShell>
    )
  }

  // ─── STATE 3: Active Dashboard ─────────────────────────────────────────────

  return (
    <DashboardShell className="max-w-[1400px]">
      <div className="space-y-8 animate-in fade-in duration-500">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-4xl font-headline font-bold text-[#191C1E] tracking-tight">Academic Organization</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl font-medium">
              Setup classes and sections
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge className="text-[9px] font-bold px-2.5 py-1 border shadow-none bg-white text-slate-500 border-slate-200 pointer-events-none select-none">
              <svg className="w-3 h-3 mr-1.5" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Powered by Google
            </Badge>
          </div>
        </div>

        {/* Stacked Layout */}
        <div className="flex flex-col gap-8">
          
          {/* TOP CARD: Create Classes and Sections */}
          <Card className="bg-white border-slate-200/60 shadow-sm rounded-xl overflow-hidden ring-1 ring-slate-100">
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-red-500 to-yellow-500" />
            <CardHeader className="bg-white border-b border-slate-100 pb-4">
              <CardTitle className="text-lg font-headline font-bold text-[#191C1E] flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-slate-400" />
                Create Classes and Sections
              </CardTitle>
            </CardHeader>
            
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                {/* Left Side: Add Class Form */}
                <form onSubmit={handleCreateClass} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-slate-700">New Class</Label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="e.g. Class 11, Grade 10" 
                        value={newClassName}
                        onChange={(e) => setNewClassName(e.target.value)}
                        className="h-12 border-slate-200 focus-visible:ring-slate-900 bg-slate-50 font-semibold text-sm"
                        disabled={isCreatingClass}
                      />
                      <Button 
                        type="submit" 
                        disabled={isCreatingClass || !newClassName.trim()} 
                        className="h-12 px-6 bg-[#191C1E] hover:bg-black text-white font-bold shrink-0 shadow-sm"
                      >
                        {isCreatingClass ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
                      </Button>
                    </div>
                  </div>
                </form>

                {/* Right Side: Add Section Form */}
                <form onSubmit={handleAddSection} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-slate-700">Target Class</Label>
                      <Select value={selectedClassId} onValueChange={setSelectedClassId} disabled={classes.length === 0 || isCreatingSection}>
                        <SelectTrigger className="h-12 bg-slate-50 border-slate-200 font-semibold text-sm">
                          <SelectValue placeholder={classes.length === 0 ? "Create a Class first" : "Select a Class"} />
                        </SelectTrigger>
                        <SelectContent>
                          {classes.map(c => (
                            <SelectItem key={c.id} value={c.id} className="font-semibold text-sm">{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-slate-700">New Section</Label>
                      <div className="flex gap-2">
                        <Input 
                          placeholder="e.g. Section A, Science" 
                          value={newSectionName}
                          onChange={(e) => setNewSectionName(e.target.value)}
                          className="h-12 border-slate-200 focus-visible:ring-slate-900 bg-slate-50 font-semibold text-sm"
                          disabled={!selectedClassId || isCreatingSection}
                        />
                        <Button 
                          type="submit" 
                          disabled={isCreatingSection || !newSectionName.trim() || !selectedClassId} 
                          className="h-12 px-6 bg-[#191C1E] hover:bg-black text-white font-bold shrink-0 shadow-sm"
                        >
                          {isCreatingSection ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </CardContent>
          </Card>

          {/* BOTTOM CARD: Workspace Directory */}
          <Card className="bg-white border-slate-200/60 shadow-sm rounded-xl overflow-hidden ring-1 ring-slate-100">
            <CardHeader className="bg-white border-b border-slate-100 py-4 px-6 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Library className="w-4 h-4 text-slate-400" />
                <CardTitle className="text-xs font-semibold text-slate-700">Workspace Directory</CardTitle>
              </div>
              <Badge variant="outline" className="text-[9px] font-bold h-6 px-2.5 bg-white border-slate-200">
                {classes.length} {classes.length === 1 ? "Class" : "Classes"}
              </Badge>
            </CardHeader>
            
            <CardContent className="p-0">
              {classes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-slate-200" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-[#191C1E]">No Academic Classes Found</h3>
                    <p className="text-sm text-slate-500 max-w-[250px] mx-auto font-medium">
                      Use the panel above to add your first class under <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded font-mono">/Students</code>.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {classes.map(cls => (
                    <div key={cls.id} className="p-3.5 hover:bg-slate-50/30 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-base font-bold text-[#191C1E]">{cls.name}</h3>
                          <Badge className="bg-blue-50 text-blue-600 border border-blue-150 hover:bg-blue-100 shadow-none text-[9px] font-bold px-1.5 py-0 h-4">
                            {cls.sections.length} Sections
                          </Badge>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => setClassToDelete(cls.id)}
                          className="text-slate-400 hover:text-red-600 hover:bg-red-50 h-7 w-7 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {cls.sections.length > 0 ? (
                        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                          <Table>
                            <TableHeader className="bg-slate-50/80">
                              <TableRow className="border-slate-100">
                                <TableHead className="text-xs font-medium text-slate-500 py-1 h-auto">Section Name</TableHead>
                                <TableHead className="text-xs font-medium text-slate-500 py-1 h-auto w-[320px]">Directory Path</TableHead>
                                <TableHead className="text-xs font-medium text-slate-500 py-1 h-auto text-right w-24">Action</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {cls.sections.map(section => (
                                <TableRow key={section.id} className="border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                                  <TableCell className="py-1 font-semibold text-slate-800 text-xs">
                                    {section.name}
                                  </TableCell>
                                  <TableCell className="py-1">
                                    <code className="text-[9px] font-mono font-medium text-slate-400">/Students/{cls.name}/{section.name}</code>
                                  </TableCell>
                                  <TableCell className="py-1 text-right">
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => setSectionToDelete({ classId: cls.id, sectionId: section.id })}
                                      className="text-slate-400 hover:text-red-600 hover:bg-red-50 h-6 w-6 rounded transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="border border-dashed border-slate-200 rounded-lg py-2.5 text-center bg-slate-50/50">
                          <p className="text-xs font-medium text-slate-400">No sections attached</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Class Deletion Dialog */}
      <AlertDialog open={!!classToDelete} onOpenChange={(open) => !open && !isDeleting && setClassToDelete(null)}>
        <AlertDialogContent className="bg-white border-slate-200 rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline font-bold text-xl text-[#191C1E]">Delete Class Schema?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 font-medium leading-relaxed">
              This action cannot be undone. This will permanently delete the class (<code className="font-mono text-xs text-red-600 bg-red-50 px-1 py-0.5 rounded">/Students/{classToDelete}</code>) and all associated sub-sections from Google Workspace.
            </AlertDialogDescription>
            <div className="mt-3 flex items-start gap-3 p-3 bg-amber-50 border border-amber-200/60 rounded-lg text-amber-800 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div className="space-y-1 text-left">
                <p className="font-bold text-amber-950">Student Relocation Warning</p>
                <p className="font-medium leading-relaxed text-amber-700">
                  Before deleting this class, please note that any students currently assigned to this class and its sections will be moved to the parent Student directory.
                </p>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel disabled={isDeleting} className="font-bold text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-black">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              disabled={isDeleting} 
              onClick={(e) => { e.preventDefault(); handleDeleteClass(); }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold border-0 shadow-md"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Delete Class"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Section Deletion Dialog */}
      <AlertDialog open={!!sectionToDelete} onOpenChange={(open) => !open && !isDeleting && setSectionToDelete(null)}>
        <AlertDialogContent className="bg-white border-slate-200 rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline font-bold text-xl text-[#191C1E]">Remove Section?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 font-medium leading-relaxed">
              This action will remove the section (<code className="font-mono text-xs text-red-600 bg-red-50 px-1 py-0.5 rounded">/Students/{sectionToDelete?.classId}/{sectionToDelete?.sectionId}</code>) from Google Workspace.
            </AlertDialogDescription>
            <div className="mt-3 flex items-start gap-3 p-3 bg-amber-50 border border-amber-200/60 rounded-lg text-amber-800 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div className="space-y-1 text-left">
                <p className="font-bold text-amber-950">Student Relocation Warning</p>
                <p className="font-medium leading-relaxed text-amber-700">
                  Before removing this section, please note that any students currently assigned to it will be moved to the parent class directory.
                </p>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel disabled={isDeleting} className="font-bold text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-black">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              disabled={isDeleting} 
              onClick={(e) => { e.preventDefault(); handleDeleteSection(); }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold border-0 shadow-md"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Remove Section"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </DashboardShell>
  )
}
